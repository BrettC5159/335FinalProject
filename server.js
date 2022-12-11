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
const { resolveSoa } = require('dns');
const portNumber = 5000;
const stateKey = 'spotify_auth_state';
const spotify_uri = 'https://api.spotify.com/v1/';

require('dotenv').config({path: path.resolve(__dirname, '.env')});
const username = process.env.MONGO_DB_USERNAME;
const password = process.env.MONGO_DB_PASSWORD;
const database = process.env.MONGO_DB_NAME;
const mongoCollection = process.env.MONGO_COLLECTION;
const spotifyClientId = process.env.SPOTIFY_CLIENT_ID;
const redirect_uri = process.env.SPOTIFY_REDIRECT_URI;
const redirect_uri_gather_songs = process.env.SPOTIFY_REDIRECT_URI_GATHER;
const base64_auth = process.env.BASE64_AUTH;
let period;
let accesstoken;

// Setup web server
const webServer = http.createServer();
process.stdin.setEncoding('utf-8');

console.log(`Web started and running at http://localhost:${portNumber}`)
console.log(`Stop to shutdown the server: `);

// Process stdin events :)
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

// Setup express
app.set('views', path.resolve(__dirname, "templates"));
app.set('view engine', 'ejs');
app.listen(portNumber);
app.use(bodyParser.urlencoded({extended: false}));

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
connectMongo().catch(console.error);

function getRandomString(length) {
  var text = '';
  var possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

  for (var i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

app.get('/', (req, res) => {
  res.render('frontPage');
});

app.use(cookieParser())
  .use(cors())
  .use(express.static(__dirname + '/templates'));

app.post('/login', (req, res) => {
  period = req.body.period;
  console.log(period);

  let state = getRandomString(16);
  res.cookie(stateKey, state);

  const scope = 'user-top-read';
  res.redirect('https://accounts.spotify.com/authorize?' + 
    querystring.stringify({
      response_type: 'code',
      client_id: spotifyClientId,
      scope: scope,
      redirect_uri: redirect_uri,
      state: state
    }));

});

app.get('/callback', async (req, res) => {
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
  res.redirect('/gathersongs')
});

app.get('/gathersongs', async (req, res) => {
  console.log('Getting your top songs...')
  const topSongsRawData = await axios.get(
    "https://api.spotify.com/v1/me/top/tracks?limit=50", 
    {
      headers: {
        Authorization: "Bearer " + accesstoken,
        'Content-Type': 'application/json'
    }});

    

});
