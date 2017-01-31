#!/bin/sh

ZIM2INDEX=/srv/upload/zim2index/
SCRIPT=`readlink -f $0/../`
SCRIPT_DIR=`dirname "$SCRIPT"`
MWOFFLINER="$SCRIPT_DIR/mwoffliner.js --adminEmail=contact@kiwix.org --deflateTmpHtml --verbose --skipCacheCleaning --format= --format=nopic --cacheDirectory=/data/scratch/mwoffliner/cac/"
MWMATRIXOFFLINER="$SCRIPT_DIR/mwmatrixoffliner.js --verbose --adminEmail=contact@kiwix.org --mwUrl=https://meta.wikimedia.org/ --cacheDirectory=/data/scratch/mwoffliner/cac/ --deflateTmpHtml --skipCacheCleaning"

# Wikipedia in French
$MWOFFLINER --mwUrl="https://fr.wikipedia.org/" --parsoidUrl="https://fr.wikipedia.org/api/rest_v1/page/html/" --customMainPage="user:Popo_le_Chien/Kiwix" --outputDirectory=$ZIM2INDEX/wikipedia/ &&

# Wikipedia in Spanish
$MWOFFLINER --mwUrl="https://es.wikipedia.org/" --parsoidUrl="https://es.wikipedia.org/api/rest_v1/page/html/" --customMainPage="user:Popo_le_Chien/Kiwix" --outputDirectory=$ZIM2INDEX/wikipedia/

# Wikipedia
$MWMATRIXOFFLINER --project=wiki --outputDirectory=$ZIM2INDEX/wikipedia/ --language="(de|it)"