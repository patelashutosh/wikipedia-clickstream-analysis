   #!/bin/bash
   
   #################Click stream processing################
   #source
   $KAFKA_HOME/bin/kafka-topics.sh --create --topic wikistream --bootstrap-server localhost:9092

   #processed output
   #create another topic named top_resource to store processed data for cumulative count of top accessed pages.
   $KAFKA_HOME/bin/kafka-topics.sh --create --topic top_resource --bootstrap-server localhost:9092
   #create another topic named top_resource_sliding to store processed data for sliding window of top accessed pages.
   $KAFKA_HOME/bin/kafka-topics.sh --create --topic top_resource_sliding --bootstrap-server localhost:9092 


   #################event stream processing################
   #source
   $KAFKA_HOME/bin/kafka-topics.sh --create --topic wikievent --bootstrap-server localhost:9092 

   #processed
   $KAFKA_HOME/bin/kafka-topics.sh --create --topic event_top_categories --bootstrap-server localhost:9092 
   $KAFKA_HOME/bin/kafka-topics.sh --create --topic event_wikitype --bootstrap-server localhost:9092 