import scala.util.Try
import org.apache.spark.sql.streaming.Trigger
import org.apache.spark.sql.types._

case class WikiEventtream(timestamp: Long, wiki: String, title: String, categoryText: String)

def parseVal(x: Array[Byte]): Option[WikiEventtream] = {
    val split: Array[String] = new Predef.String(x).split("\\t")
    if (split.length == 4) {
    Try(WikiEventtream(split(0).toLong, split(1), split(2), split(3))).toOption
    } else
    None
    }

val records = (
    spark.readStream.format("kafka")
                        .option("subscribe", "wikievent")
                        .option("failOnDataLoss", "false")
                        .option("kafka.bootstrap.servers", "localhost:9092").load()
)

val records_preprocessed = records.select("value").as[Array[Byte]].flatMap(x => parseVal(x))

val slidingMessagesCategories = (
    records_preprocessed
                        .where("wiki == 'enwiki'")
                        .filter(!col("categoryText").rlike("Articles|articles|Wikidata|Noindexed|external|Pages|pages|CS1|AfD|AC|Stubs|stub"))
                        .withColumn("current_timestamp", col("timestamp").cast(TimestampType)) 
                        .withWatermark("current_timestamp", "30 minutes")
                        .groupBy($"categoryText", window($"current_timestamp", "30 minutes", "2 minute"))
                        .count()
                        .filter($"count" >= 5)
                        .withColumnRenamed("categoryText","key")
                        .withColumnRenamed("count","value")
                        .withColumn("value",col("value").cast("string"))
)

val checkpointDirCategories = "/tmp/spark_checkpoint_wikievent_top_categories"
val kafkaSinkWindowCategory = (
    slidingMessagesCategories.writeStream
    .format("kafka")
    .trigger(Trigger.ProcessingTime("1 minute"))
    .option("kafka.bootstrap.servers", "localhost:9092")
    .option("topic", "event_top_categories")
    .option("checkpointLocation", checkpointDirCategories)
    .outputMode("update")
    .start()
)

val slidingMessagesWiki = (
    records_preprocessed
                        .withColumn("current_timestamp", col("timestamp").cast(TimestampType)) 
                        .withWatermark("current_timestamp", "10 minutes")
                        .groupBy($"wiki", window($"current_timestamp", "5 minutes", "1 minute"))
                        .count()
                        .filter($"count" >= 20)
                        .withColumnRenamed("wiki","key")
                        .withColumnRenamed("count","value")
                        .withColumn("value",col("value").cast("string"))
)

val checkpointDirWiki = "/tmp/spark_checkpoint_wikievent_wikitype"
val kafkaSinkWindowWiki = (
    slidingMessagesWiki.writeStream
         .format("kafka")
         .trigger(Trigger.ProcessingTime("1 minute"))
         .option("kafka.bootstrap.servers", "localhost:9092")
         .option("topic", "event_wikitype")
         .option("checkpointLocation", checkpointDirWiki)
         .outputMode("update")
         .start()
)

//Clickstream processing

case class WikiClickstream(prev: String, curr: String, link: String, n: Long)
def parseClickStreamVal(x: Array[Byte]): Option[WikiClickstream] = {
        val split: Array[String] = new Predef.String(x).split("\\t")
        if (split.length == 4) {
        Try(WikiClickstream(split(0), split(1), split(2), split(3).toLong)).toOption
        } else
        None
        }

val clickStreamRecords = (
    spark.readStream.format("kafka")
                        .option("subscribe", "wikistream")
                        .option("failOnDataLoss", "false")
                        .option("kafka.bootstrap.servers", "localhost:9092").load()
)

val clickStreamRecords_preprocessed = (
    clickStreamRecords.select("value").as[Array[Byte]]
                     .flatMap(x => parseClickStreamVal(x))
)

val clickStreamMessages = (
    clickStreamRecords_preprocessed
                    .groupBy("curr")
                    .agg(Map("n" -> "sum"))
                    .sort($"sum(n)".desc)
                    .withColumnRenamed("curr","key")
                    .withColumnRenamed("sum(n)","value")
                    .withColumn("value",col("value").cast("string"))
                    .limit(10)
)

val clickStreamCheckpointDir = "/tmp/spark_checkpoint_clickStream"
val clickStreamKafkaSink = (
    clickStreamMessages.writeStream
       .format("kafka")
       .option("kafka.bootstrap.servers", "localhost:9092")
       .option("topic", "top_resource")
       .option("checkpointLocation", clickStreamCheckpointDir)
       .outputMode("complete")
       .start()
)


val slidingMessages = (
    clickStreamRecords_preprocessed
                        .withColumn("current_timestamp", current_timestamp())
                        .withWatermark("current_timestamp", "4 minutes")
                        .groupBy( $"curr", window($"current_timestamp", "4 minutes", "2 minutes"))
                        .agg(sum($"n"))
                        .sort($"sum(n)".desc)
                        .withColumnRenamed("curr","key")
                        .withColumnRenamed("sum(n)","value")
                        .withColumn("value",col("value").cast("string"))
                        .limit(20)  
)

val slidingCheckpointDir = "/tmp/spark_checkpoint_slidingwindow"
val kafkaSinkWindow = (
    slidingMessages.writeStream
         .format("kafka")
         .trigger(Trigger.ProcessingTime("60 seconds"))
         .option("kafka.bootstrap.servers", "localhost:9092")
         .option("topic", "top_resource_sliding")
         .option("checkpointLocation", slidingCheckpointDir)
         .outputMode("complete")
         .start()
)