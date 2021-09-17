
 //name of the package
 // To build simply type `sbt clean package`
name := "main/scala"
//version of our package
version := "1.0"
//version of Scala
scalaVersion := "2.12.10"
// spark library dependencies
// change to Spark 3.0 binaries when released`
libraryDependencies ++= Seq(
  "org.apache.spark" %% "spark-core" % "3.1.2",
  "org.apache.spark" %% "spark-sql"  % "3.1.2",
  "org.apache.spark" %% "spark-sql-kafka-0-10" % "3.1.2"
)