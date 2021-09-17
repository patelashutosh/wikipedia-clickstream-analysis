/*
Kafka consumer, 
express.js as webserver (port 3000)
socket.io for live connection with browser
*/
var kafka = require('kafka-node');
const express = require('express');
const path = require('path'); 
const port = 3000;
const app = express();
var data_full = [];
var data_sliding = [];
var event_top_categories = [];
var event_wikitype = [];

const client = new kafka.KafkaClient('localhost:9092');
const offset = new kafka.Offset(client);

let consumer = new kafka.Consumer(
  client, [{ topic: 'top_resource', partition: 0 }, 
  { topic: 'top_resource_sliding', partition: 0 },
  { topic: 'event_top_categories', partition: 0 },
  { topic: 'event_wikitype', partition: 0 }
], { autoCommit: false });

function sortByValue(arr) {
  arr.sort(function (a, b) {
    var keyA = parseInt(a.value),
      keyB = parseInt(b.value);
    if (keyA < keyB) return -1;
    if (keyA > keyB) return 1;
    return 0;
  });
}

function convertToArray(mapData) {
  var arrs = new Array();
  var i = 0;
  for (let [key, value] of mapData.entries()) {
    arrs.push(value);
  }
  return arrs;
}

function preProcessMessage(dataArr, n) {
  console.log("preProcessMessage");
  sortByValue(dataArr);
  var dataMap = new Map();
  for (var i = 0; i < dataArr.length; i++) {
    dataMap.set(dataArr[i].key, dataArr[i])
  }
  var newArr = convertToArray(dataMap);
  sortByValue(newArr);
  return newArr.slice(-n);
}

const server = app.listen(port, () => {
  console.log(`Listening on port ${server.address().port}`);
});
app.get('/', function (req, res) {
  res.sendFile('index.html', { root: __dirname });
});
app.use(express.static('public'))

const io = require('socket.io')(server, {
  cors: {
    origin: '*',
  }
});

io.on('connection', function (socket) {
  console.log('user connected');
  //emit initial messages for both charts
  if(data_full.length > 0) {
    console.log('data_full.length', data_full.length);
    io.emit("message", data_full);//.slice(1).slice(-50))
  }
  if(data_sliding.length > 0) {
    console.log('data_sliding.length', data_sliding.length);
    io.emit("message", data_sliding);//.slice(1).slice(-50))
  }
  if(event_top_categories.length > 0) {
    console.log('event_top_categories.length', event_top_categories.length);
    io.emit("message", event_top_categories);
  }
  if(event_wikitype.length > 0) {
    console.log('event_wikitype.length', event_wikitype.length);
    io.emit("message", event_wikitype);
  }
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
  else if (message.topic == 'event_top_categories') {
    dataArr = event_top_categories;
  }
  else if (message.topic == 'event_wikitype') {
    dataArr = event_wikitype;
  } else {
    console.error("Topic unknown", message.topic);
    return;
  }
  
  dataArr.push(message)
  if (dataArr.length % 100 == 0) {
    //console.log(message.topic, message.key, message.value);
    dataArr = preProcessMessage(dataArr, 100); //.slice(1).slice(-100)
  }

  //set the limited array back
  if (message.topic == 'top_resource') {
    data_full = dataArr.slice(0);
  } else if (message.topic == 'top_resource_sliding') {
    data_sliding = dataArr.slice(0);
  }
  else if (message.topic == 'event_top_categories') {
    event_top_categories = dataArr.slice(0);
  }
  else if (message.topic == 'event_wikitype') {
    event_wikitype = dataArr.slice(0);
  }

  io.emit("message", [message]);
});

consumer.on('error', function (err) {
  console.log('error', err);
});

