#!/bin/bash

FILES=$1/*
for f in $FILES
do
    echo "pushing $f file"
    cat $f | $KAFKA_HOME/bin/kafka-console-producer.sh --broker-list $2 --topic $3
    sleep 60
done
