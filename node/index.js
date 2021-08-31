/*
Kafka consumer, 
express.js as webserver (port 3000)
socket.io for live connection with browser
*/
var kafka = require('kafka-node');
const express = require('express');
const port = 3000;
const app = express();
var data_full = [];
var data_sliding = [];

const client = new kafka.KafkaClient('localhost:9092');

let consumer = new kafka.Consumer(
  client, [{ topic: 'top_resource', partition: 0 }, { topic: 'top_resource_sliding', partition: 0 }], { autoCommit: false });

const server = app.listen(port, () => {
  console.log(`Listening on port ${server.address().port}`);
});
app.get('/', function (req, res) {
  res.sendFile('index.html', { root: __dirname });
});
const io = require('socket.io')(server, {
  cors: {
    origin: '*',
  }
});

io.on('connection', function (socket) {
  console.log('user connected');
  //emit initial messages for both charts
  io.emit("message", data_full.slice(1).slice(-50))
  io.emit("message", data_sliding.slice(1).slice(-50))
  socket.on('disconnect', function () {
    console.log('user disconnected');
  });
});

consumer.on('message', function (message) {
  console.log(message.topic, message.key, message.value);
  let dataArr = [];
  if (message.topic == 'top_resource') {
    dataArr = data_full;
  } else if (message.topic == 'top_resource_sliding') {
    dataArr = data_sliding;
  }
  dataArr.push(message)
  dataArr = dataArr.slice(1).slice(-100)
  io.emit("message", [message]);
});

consumer.on('error', function (err) {
  console.log('error', err);
});
