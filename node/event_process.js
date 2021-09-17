var fetch = require("node-fetch");
var EventSource = require('eventsource');
const url = require('url');
var kafka = require('kafka-node');

const client = new kafka.KafkaClient('localhost:9092');
var Producer = kafka.Producer,
    producer = new Producer(client);

producer.on('ready', function () {
  console.log('Producer is ready');   
});

producer.on('error', function (err) {
    console.log('producer error: ' + err);
});

var streamurl = 'https://stream.wikimedia.org/v2/stream/recentchange';

console.log(`Connecting to EventStreams at ${streamurl}`);
var eventSource = new EventSource(streamurl);

eventSource.onopen = function(event) {
    console.log('--- Opened connection.');
};

eventSource.onerror = function(event) {
    console.error('--- Encountered error', event);
};

var wiki = 'enwiki';
var type = 'edit';
eventSource.onmessage = function(event) {
    // event.data will be a JSON string containing the message event.
    var change = JSON.parse(event.data);
    if (change.type == type)
    {
        //console.log(change);
        var timestamp = change.timestamp;
        var title = change.title;
        var wiki = change.wiki;
        //console.log(timestamp, wiki, title);
        getCategory(timestamp, wiki, title);
    }
};

function sendKakfaMessage(payloads) {
  if(producer.ready){
    producer.send(payloads, function(err,res){
            //console.log(res)
    });
 } 
}

//var getCategory =
function getCategory(timestamp, wiki, title) {
  var categoryUrl = "https://en.wikipedia.org/w/api.php"; 

  var params = {
      action: "query",
      format: "json",
      prop: "categories",
      clshow: "!hidden",
      titles: title
  };
  
  categoryUrl = categoryUrl + "?origin=*";
  Object.keys(params).forEach(function(key){categoryUrl += "&" + key + "=" + params[key];});
  
  categoryUrl = new URL(categoryUrl);
  //console.log(categoryUrl);

  fetch(categoryUrl, {
    headers: { 'Content-Type': 'application/json', 'User-Agent': "MPDS Project work" },
  })
      .then(function(response){return response.json();})
      .then(function(response) {
          //console.log(response.query);
          var pages = response.query.pages;
          if(pages) {
            for (var p in pages) {
              if(pages[p].categories != null && typeof pages[p].categories[Symbol.iterator] === 'function' ) {
                  for (var cat of pages[p].categories) {
                    var categoryText = cat.title.replace("Category:", "")
                    var message = timestamp +"\t" + wiki+"\t" + title +"\t" +categoryText;
                    console.log(message);

                    payloads = [{ topic: 'wikievent', messages:message}];
                    sendKakfaMessage(payloads);
                }
                break;
              }
              
            }
          }
          
      })
      .catch(function(error){console.log(error);});

};
