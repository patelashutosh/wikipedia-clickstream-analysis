#pip install wikipedia-api
#pip install spacy
#pip install en_core_web_sm
#python -m spacy download en_core_web_sm


import wikipediaapi
import spacy
from spacy import displacy
from collections import Counter
import en_core_web_sm
nlp = en_core_web_sm.load()
import csv
from random import randrange
from datetime import timedelta
from datetime import datetime
from time import sleep
from json import dumps
from kafka import KafkaProducer
from collections import defaultdict
import os

producer = KafkaProducer(
    bootstrap_servers=['localhost:9092'],
    value_serializer=lambda x: dumps(x).encode('utf-8')
)

#Need to update date for different month / year

start_date = datetime.strptime("1/1/2018 1:30 PM", "%m/%d/%Y %I:%M %p")
end_date = datetime.strptime("1/1/2019 4:50 AM", "%m/%d/%Y %I:%M %p")
delta = end_date - start_date
int_delta = (delta.days * 24 * 60 * 60) + delta.seconds

def getPageCategory(pageName):
    wiki_wiki = wikipediaapi.Wikipedia('en')
    page_py = wiki_wiki.page(pageName)
    cat1 = str(page_py.categories)
    doc = nlp(cat1)
    temp = defaultdict(int)
    for i in doc.ents:
        if not str(i).isnumeric() and str(i)!='Wikipedia':
            temp[i] += 1
    res = max(temp, key=temp.get)
    return str(res)
#print("Word with maximum frequency : " + str(res))
    
#print(doc.ents)
#sorted(page_py.categories)
#cat1

#with open("data2.tsv") as file:
def processFile(file):
    tsv_file = csv.reader(file, delimiter="\t")
    for line in tsv_file:
        set_category = getPageCategory(line[1])
        for i in range(int(line[3])):
            random_second = randrange(int_delta)
            set_date = start_date + timedelta(seconds=random_second)
            #print(line[0]+" "+line[1]+" "+line[2] + " " + str(set_date) +" "+ str(set_category))
            data = line[0]+" "+line[1]+" "+line[2] + " " + str(set_date)+" "+str(set_category)
            #producer.send('topic_1', value=data)
            producer.send('wikistream', value=data)
        #sleep(0.5)
        print(line[0]+" "+line[1]+" "+line[2] +" "+ str(set_category))

folderpath = r"./split/" # make sure to put the 'r' in front
filepaths  = [os.path.join(folderpath, name) for name in os.listdir(folderpath)]

for path in filepaths:
    #os.path.basename(filepath)
    with open(path, 'r') as f:
        processFile(f)
        
        

