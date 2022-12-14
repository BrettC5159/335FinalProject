const http = require('http');
const express = require('express');
const app = express();
const path = require('path');
const bodyParser = require('body-parser');
const axios = require('axios');
const querystring = require('querystring');
const cors = require('cors');
const ejs = require('ejs');
const cookieParser = require('cookie-parser');
const { MongoClient, ServerApiVersion } = require('mongodb');
const portNumber = process.env.PORT || 5000;
const stateKey = 'spotify_auth_state';
const spotify_uri = 'https://api.spotify.com/v1/';

require('dotenv').config({path: path.resolve(__dirname, '.env')});
const username = process.env.MONGO_DB_USERNAME;
const password = process.env.MONGO_DB_PASSWORD;
const database = process.env.MONGO_DB_NAME;
const mongoCollection = process.env.MONGO_COLLECTION;
const spotifyClientId = process.env.SPOTIFY_CLIENT_ID;
const redirect_uri = process.env.SPOTIFY_REDIRECT_URI;
const base64_auth = process.env.BASE64_AUTH;
let baseurl = `${process.env.BASE_URL}`;

if (baseurl == "http://localhost") {
  baseurl += `:${portNumber}`;
}

let period;
let accesstoken;

// Setup web server
const webServer = http.createServer();
process.stdin.setEncoding('utf-8');

console.log(`Web started and running at http://localhost:${portNumber}`);
console.log(`Stop to shutdown the server: `);

// Process stdin events
process.stdin.on('readable', () => {
  let input;
  while ((input = process.stdin.read()) !== null) {
    input = input.trim();
    input = input.toLowerCase();

    if (input === 'stop') {
      console.log('Shutting down server');
      process.exit(0);
    } else {
      console.log(`Invalid command: ${input}`);
    }

    console.log(`Stop to shutdown the server: `);
  }
});

// Setup Mongo
let client;

async function connectMongo() {
  const uri = `mongodb+srv://${username}:${password}@cluster0.qrndf1q.mongodb.net/?retryWrites=true&w=majority`;
  client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });
  
  try {
    await client.connect();
  } catch (e) {
    console.error(e);
  }
}
connectMongo()
  .then(() => app.listen(portNumber))
  .catch(console.error);

// Setup express
app.set('views', path.resolve(__dirname, "templates"));
app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({extended: false}));

function getRandomString(length) {
  var text = '';
  var possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

  for (var i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

// Front page form endpoint
app.get(`/`, (req, res) => {
  variables = {
    submitURL: `${baseurl}/login`
  }

  res.render('frontPage', variables);
});

app.use(cookieParser())
  .use(cors())
  .use(express.static(__dirname + '/templates'));


// Prompt to login to spotify account
app.post(`/login`, (req, res) => {
  period = req.body.period;

  let state = getRandomString(16);
  res.cookie(stateKey, state);

  const scope = 'user-top-read playlist-modify-public playlist-modify-private';
  res.redirect('https://accounts.spotify.com/authorize?' + 
    querystring.stringify({
      response_type: 'code',
      client_id: spotifyClientId,
      scope: scope,
      redirect_uri: redirect_uri,
      state: state
    }));

});

// Call back once logged into spotify account
app.get(`/callback`, async (req, res) => {

  // Authorize signed in user with API. Retrieve accesstoken that can be used in all later requests.
  console.log('Doing some authorization and setup...');
  const spotifyResponse = await axios.post(
    'https://accounts.spotify.com/api/token',
    querystring.stringify({
      grant_type: "authorization_code",
      code: req.query.code,
      redirect_uri: redirect_uri
    }),
    {
      headers: {
        Authorization: "Basic " + base64_auth,
        "Content-Type": "application/x-www-form-urlencoded"
      }
    }
  );
  accesstoken = spotifyResponse.data.access_token;

  // Get top songs from user's spotify listening history
  console.log('Getting your top songs...')
  let time_range;
  switch (period) {
    case "Four Weeks":
      time_range="short_term";
      break;
    case "Six Months":
      time_range="medium_term";
      break;
    case "All Time":
      time_range="long_term";
      break;
  }

  const topSongsRawData = await axios.get(
  `${spotify_uri}me/top/tracks?limit=50&time_range=${time_range}`, 
  {
    headers: {
      Authorization: "Bearer " + accesstoken,
      'Content-Type': 'application/json'
  }});

  // Upload top user songs to db
  console.log('Uploading top songs to db...');
  let topSongURIs = [];
  for (const song of topSongsRawData.data.items) {
    topSongURIs.push({ song_uri: song.uri });
  }
  await client.db(database).collection(mongoCollection).insertMany(topSongURIs);
  console.log('Songs uploaded to mongodb!');

  // Get more general user account info, preparation for playlist creation
  console.log('Getting account info...');
  const userAccountInfo = await axios.get(
    `${spotify_uri}me`,
    {
      headers: {
        Authorization: "Bearer " + accesstoken,
        'Content-Type': 'application/json'
      }});

  const userId = userAccountInfo.data.id;
  console.log(userId);

  // Create new empty playlist in user account
  console.log('Creating playlist...');
  let playlistRes = await axios({
    method: 'POST',
    url: `${spotify_uri}users/${userId}/playlists`,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + accesstoken
    },
    data: {
      name: "Terps Top 50",
      description: "UMD students top 50 songs from listener data."
    }
  });
  const playlistId = playlistRes.data.id;
  const playlistUrl = playlistRes.data.external_urls.spotify;

  // From MongoDB get top songs of all users who have contributed data
  console.log('Getting up to date top user songs...');

  const aggCursor = client.db(database).collection(mongoCollection)
    .aggregate([
      { $group: { _id: "$song_uri", count: {$sum: 1}}},
      { $sort: {count: -1}},
      { $limit: 50},
      { $project: { "_id": 1}}
  ]);

  let songIdentifiers = [];

  for await (const song of aggCursor) {
    songIdentifiers.push(song._id);
  }

  // Add top songs to playlist
  console.log('Adding all songs to your playlist...');

  await axios({
    method: 'POST',
    url: `${spotify_uri}playlists/${playlistId}/tracks`,
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + accesstoken
    },
    data: {
      uris: songIdentifiers,
      position: 0,
    }
  });

  console.log('All playlists posted! Displaying playlist now...');

  let playlistEmbedUrl = 
  `https://open.spotify.com/embed/playlist/${playlistUrl.split('/')[4].split('?')[0]}?utm_source=generator`
  
  const variables = {
    name: userAccountInfo.data.display_name,
    playlist: playlistEmbedUrl
  };

  res.render('resultPage.ejs', variables);
  res.end();
});