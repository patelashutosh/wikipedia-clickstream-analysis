package main.scala

import scala.util.Try
import org.apache.spark.sql.streaming.Trigger
import org.apache.spark.sql.SparkSession
import org.apache.spark.sql.types._
import org.apache.spark.sql.expressions.Window;
import org.apache.spark.sql.functions._
//import org.apache.spark.sql.functions.current_timestamp 

object WikipediaStreaming {
    case class WikiClickstream(prev: String, curr: String, link: String, n: Long)

  def main(args: Array[String]) {
    val spark = SparkSession
      .builder
      .appName("WikipediaStreaming")
      .getOrCreate()
    import spark.implicits._


    def parseVal(x: Array[Byte]): Option[WikiClickstream] = {
            val split: Array[String] = new Predef.String(x).split("\\t")
            if (split.length == 4) {
                Try(WikiClickstream(split(0), split(1), split(2), split(3).toLong)).toOption
            } else
                None
        }

    val records = spark.readStream.format("kafka")
        .option("subscribe", "wikistream")
        .option("failOnDataLoss", "false")
        .option("kafka.bootstrap.servers", "localhost:9092").load()

    val records_preprocessed = records.select("value").as[Array[Byte]]
        .flatMap(x => parseVal(x))

    //top_resource
    val messages = records_preprocessed
        .groupBy("curr")
        .agg(Map("n" -> "sum"))
        .sort($"sum(n)".desc)
        .withColumnRenamed("curr","key")
        .withColumnRenamed("sum(n)","value")
        .withColumn("value",col("value").cast("string"))
        .limit(10)

    val checkpointDir = "/tmp/spark_checkpoint"
    val kafkaSink = messages.writeStream
        .format("kafka")
        .option("kafka.bootstrap.servers", "localhost:9092")
        .option("topic", "top_resource")
        .option("checkpointLocation", checkpointDir)
        .outputMode("complete")
        .start()

    kafkaSink.awaitTermination()

    //top_resource_sliding
    val slidingMessages = records_preprocessed
        .withColumn("current_timestamp", current_timestamp())
        .withWatermark("current_timestamp", "4 minutes")
        .groupBy(window($"current_timestamp", "4 minutes", "2 minutes"), $"curr")
        .agg(sum($"n"))
        .sort($"sum(n)".desc)
        .withColumnRenamed("curr","key")
        .withColumnRenamed("sum(n)","value")
        .withColumn("value",col("value").cast("string"))
        .limit(20)   

    val checkpointDirSliding = "/tmp/spark_checkpoint_window"
    val kafkaSinkWindow = slidingMessages.writeStream
        .format("kafka")
        .trigger(Trigger.ProcessingTime("30 second"))
        .option("kafka.bootstrap.servers", "localhost:9092")
        .option("topic", "top_resource_sliding")
        .option("checkpointLocation", checkpointDirSliding)
        .outputMode("complete")
        .start()
    kafkaSinkWindow.awaitTermination()
  }
}