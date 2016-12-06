#!/bin/sh

ZIM2INDEX=/srv/upload/zim2index/
SCRIPT=`readlink -f $0/../`
SCRIPT_DIR=`dirname "$SCRIPT"`
MWOFFLINER="$SCRIPT_DIR/mwoffliner.js --speed=10 --adminEmail=contact@kiwix.org --deflateTmpHtml --verbose --skipHtmlCache --skipCacheCleaning --format= --format=nopic --cacheDirectory=/data/scratch/mwoffliner/cac/"
MWMATRIXOFFLINER="$SCRIPT_DIR/mwmatrixoffliner.js --speed=10 --verbose --skipHtmlCache --adminEmail=contact@kiwix.org --mwUrl=https://meta.wikimedia.org/ --cacheDirectory=/data/scratch/mwoffliner/cac/ --deflateTmpHtml --skipCacheCleaning"

# Wikipedia in Arabic
$MWOFFLINER --mwUrl="https://ar.wikipedia.org/" --parsoidUrl="https://ar.wikipedia.org/api/rest_v1/page/html/" --customMainPage="مستخدم:Stephane_(Kiwix)/Landing" --outputDirectory=$ZIM2INDEX/wikipedia/ &&

# Wikipedia in Hebrew
$MWOFFLINER --mwUrl="https://he.wikipedia.org/" --parsoidUrl="https://he.wikipedia.org/api/rest_v1/page/html/" --customMainPage="ויקיפדיה:עמוד_ראשי/לא-מקוון" --outputDirectory=$ZIM2INDEX/wikipedia/ &&

# Wikipedia in French
$MWOFFLINER --mwUrl="https://fr.wikipedia.org/" --parsoidUrl="https://fr.wikipedia.org/api/rest_v1/page/html/" --customMainPage="user:Popo_le_Chien/Kiwix" --outputDirectory=$ZIM2INDEX/wikipedia/ &&

# Wikipedia in Spanish
$MWOFFLINER --mwUrl="https://es.wikipedia.org/" --parsoidUrl="https://es.wikipedia.org/api/rest_v1/page/html/" --customMainPage="user:Popo_le_Chien/Kiwix" --outputDirectory=$ZIM2INDEX/wikipedia/

