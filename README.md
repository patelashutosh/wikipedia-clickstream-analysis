# Wikipedia Clickstream Analysis using Apache Kafka, Spark streaming and Node.Js

The Wikipedia Clickstream dataset contains counts of (referrer, resource) pairs extracted from the request logs of Wikipedia. 

Download appropriate dataset from: https://dumps.wikimedia.org/other/clickstream/

For e.g. https://dumps.wikimedia.org/other/clickstream/2021-05/clickstream-enwiki-2021-05.tsv.gz 

### Sample data:
|prev|curr|link|n|
|----|----|----|----|
other-search |	Scharnegoutum	| external	| 12
Drew_Dober	| UFC_Fight_Night:_Muñoz_vs._Mousasi |	link |	26

## Architecture

![architecture](docs/clickstream_processing_architecture.jpg)

## Software Setup:
> Pre requisite: Java 8, node should be installed.

1. Setup Kafka
   
   - Download Apache Kafka from https://kafka.apache.org/downloads .Latest version as of Sep 2021 is kafka_2.13-2.8.0.tgz. Direct wownload link :https://www.apache.org/dyn/closer.cgi?path=/kafka/2.8.0/kafka_2.13-2.8.0.tgz

   - Start kafka locally by following following steps:

        ```bash
        $ tar -xzf kafka_2.13-2.8.0.tgz
        $ cd kafka_2.13-2.8.0

        # Start the ZooKeeper service in a terminal. Keep the terminal running
        $ bin/zookeeper-server-start.sh config/zookeeper.properties

        # Start the Kafka broker service in another ternimal. Keep the terminal running
        $ bin/kafka-server-start.sh config/server.properties
        ```
2. Create topics in kafka
```
   #Open a new terminal and create a topic named wikistream to hold the clickstream data.
   bin/kafka-topics.sh --create --topic wikistream --bootstrap-server localhost:9092

   #create another topic named top_resource to store processed data for cumulative count of top accessed pages.
   bin/kafka-topics.sh --create --topic top_resource --bootstrap-server localhost:9092

   #create another topic named top_resource_sliding to store processed data for sliding window of top accessed pages.
   bin/kafka-topics.sh --create --topic top_resource_sliding --bootstrap-server localhost:9092 
```
3. Setup Spark
   - Download spark from https://spark.apache.org/downloads.html Direct link: https://www.apache.org/dyn/closer.lua/spark/spark-3.1.2/spark-3.1.2-bin-hadoop3.2.tgz
   - Extract spark
        ```
        tar -xzf spark-3.1.2-bin-hadoop3.2.tgz 
        cd spark-3.1.2-bin-hadoop3.2
        ```
4. Setup Node.js
   
   Checkout this git repo.
    ```bash
    # Open a new terminal and go to node directory of this git repo
    cd node

    # Install dependencies as specified in package.json
    npm install
    ```
    
## Start the services:
1. Start expressjs server 
   ```bash
   node index
   ```
2. Start spark shell in a seperate terminal.  
   ```
   cd spark-3.1.2-bin-hadoop3.2
   bin/spark-shell --packages org.apache.spark:spark-sql-kafka-0-10_2.12:3.1.2
   ```
   > If spark process gets killed due to Out of Memory error, increase memory and run spark shell as follows:
   ```
   bin/spark-shell  --driver-memory 5g --packages org.apache.spark:spark-sql-kafka-0-10_2.12:3.1.2
   ```
3. Paste following code in the spark shell to perform strreaming with kafka
   > Note: can use :paste on shell to enter paste mode
   ```scala
    import scala.util.Try
    import org.apache.spark.sql.streaming.Trigger
    case class WikiClickstream(prev: String, curr: String, link: String, n: Long)

    def parseVal(x: Array[Byte]): Option[WikiClickstream] = {
        val split: Array[String] = new Predef.String(x).split("\\t")
        if (split.length == 4) {
        Try(WikiClickstream(split(0), split(1), split(2), split(3).toLong)).toOption
        } else
        None
        }
   ```
    Read from kafka topic named `wikistream`
   ```scala
    val records = spark.readStream.format("kafka")
                        .option("subscribe", "wikistream")
                        .option("failOnDataLoss", "false")
                        .option("kafka.bootstrap.servers", "localhost:9092").load()
    ```
   Preprocess
    ```
   val records_preprocessed = records.select("value").as[Array[Byte]]
                     .flatMap(x => parseVal(x))
    ```
    Do some aggregation on streaming dataframe 
    ```scala
    val messages = records_preprocessed
                    .groupBy("curr")
                    .agg(Map("n" -> "sum"))
                    .sort($"sum(n)".desc)
                    .withColumnRenamed("curr","key")
                    .withColumnRenamed("sum(n)","value")
                    .withColumn("value",col("value").cast("string"))
                    .limit(10)
    ```
    Send the processed data to Kafka sink. topic name `top_resource`
    Create a folder for checkpoint somewhere. For e.g /tmp/spark_checkpoint and set for checkpointDir below
    ```scala
    val checkpointDir = "/tmp/spark_checkpoint"
    val kafkaSink = messages.writeStream
       .format("kafka")
       .option("kafka.bootstrap.servers", "localhost:9092")
       .option("topic", "top_resource")
       .option("checkpointLocation", checkpointDir)
       .outputMode("complete")
       .start()
   ```
       Do some aggregation with event time window
    ```scala
      val slidingMessages = records_preprocessed
                        .withColumn("current_timestamp", current_timestamp())
                        .withWatermark("current_timestamp", "10 minutes")
                        .groupBy(window($"current_timestamp", "10 minutes", "5 minutes"), $"curr")
                        .agg(sum($"n"))
                        .sort($"sum(n)".desc)
                        .withColumnRenamed("curr","key")
                        .withColumnRenamed("sum(n)","value")
                        .withColumn("value",col("value").cast("string"))
                        .limit(20)   
    ```
    Send the processed data to Kafka sink. topic name `top_resource_sliding`
    Create a folder for checkpoint somewhere. For e.g /tmp/spark_checkpoint_window and set for checkpointDir below
    ```scala
      val checkpointDir = "/tmp/spark_checkpoint_window"
      val kafkaSinkWindow = slidingMessages.writeStream
         .format("kafka")
         .trigger(Trigger.ProcessingTime("30 second"))
         .option("kafka.bootstrap.servers", "localhost:9092")
         .option("topic", "top_resource_sliding")
         .option("checkpointLocation", checkpointDir)
         .outputMode("complete")
         .start()
   ```
   Keep the terminal running

4.  Open browser http://localhost:3000/
5.  Start streaming wiki clickstream data in `wikistream` topic. Below steps will stream 200 records in the system.
    ```bash
    cd kafka_2.13-2.8.0
    #just reading last 200 lines from wiki clickstream file
    tail -200 ../data/clickstream-enwiki-2021-05.tsv | bin/kafka-console-producer.sh --broker-list localhost:9092 --topic wikistream --producer.config=config/producer.properties
    ```
    > To stream *all* records , use following steps: The script streams a 50K records file every 30 seconds into the system
   ```bash
      # update the export path appropriately to directory where kakfa was installed. Note this directory will have the bin folder.
      export KAFKA_HOME=/Users/ashutosh/MPDS_Project/Wikipedia/kafka_2.13-2.8.0
      cd data
      # assuming wiki file is extracted here as clickstream-enwiki-2021-05.tsv. (Check and update the extracted file name below).
      mkdir split
      split -l 50000 -d data/clickstream-enwiki-2021-05.tsv data/split/clickstream-enwiki-2021-05
      bash push_files_into_topic.sh split localhost:9092 wikistream

   ```

6. Notice the browser console for the messages from kafka wikistream topic. 
   Sample output
   ```
    Sea_Around_Us_(organization) 228
    AT&T_Pogo 376
    San_Juan_de_Rioseco 204
    Thamudic_B 408
    Legazpi_(Madrid) 192
    NoitulovE 504
    Titiribí 212
    New_Mexico_Bank_&_Trust_Building 248
    Beryl_Smalley 212
    Naiane_Rios 80
    Judith_Ackland 168
    Scharnegoutum 48
    Mar_'Ukban_III_(exilarch) 88
    Peter_Larisch 56

   ```
7. Monitor the charts. It will update every few seconds as new records arrive.
8. Maintenance: To start fresh, clear the topics as follows
   ```bash
   #1. Kill the kafka server. Start again with this additional parameter of delete.topic.enable
      bin/kafka-server-start.sh config/server.properties \
      --override delete.topic.enable=true

   #2. Delete all the topics.
      bin/kafka-topics.sh \
      --delete --topic top_resource \
      --zookeeper localhost:2181

      bin/kafka-topics.sh \
      --delete --topic wikistream \
      --zookeeper localhost:2181
   #3 Delete spark checkpoints
      rm -rf /tmp/spark_checkpoint
      rm -rf /tmp/spark_checkpoint_window
   #4 Restart spark and node.js apps
   ```
