const http = require('http');
const express = require('express');
const app = express();
const path = require('path');
const bodyParser = require('body-parser')
const { MongoClient, ServerApiVersion } = require('mongodb');
const portNumber = 5000;

require('dotenv').config({path: path.resolve(__dirname, '.env')});
const username = process.env.MONGO_DB_USERNAME;
const password = process.env.MONGO_DB_PASSWORD;
const database = process.env.MONGO_DB_NAME;
const mongoCollection = process.env.MONGO_COLLECTION;

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
// app.set('views', path.resolve(__dirname, "templates"));
// app.set('view engine', 'ejs');
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