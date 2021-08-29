/*
Kafka consumer, 
express.js as webserver (port 3000)
socket.io for live connection with browser
*/
var kafka = require('kafka-node');
const express = require('express');
const port = 3000;
const app = express();

const Consumer = kafka.Consumer,
 client = new kafka.KafkaClient('localhost:9092'),
 consumer = new Consumer(
 client, [ { topic: 'top_resource', partition: 0 } ], { autoCommit: false });

const server = app.listen(port, () => {
    console.log(`Listening on port ${server.address().port}`);
  });
app.get('/', function(req, res){
    res.sendFile('index.html', { root: __dirname });
});
const io = require('socket.io')(server, {
    cors: {
      origin: '*',
    }
  });

io.on('connection', function(socket){
    console.log('user connected');
    socket.on('disconnect', function(){
        console.log('user disconnected');
    });
});

consumer.on('message', function(message) {
    console.log(message.key, message.value);
    io.emit("message", message);
});
