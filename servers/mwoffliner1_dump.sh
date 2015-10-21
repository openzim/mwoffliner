#!/bin/sh

ZIM2INDEX=/srv/upload/zim2index/
SCRIPT=`readlink -f $0/../`
SCRIPT_DIR=`dirname "$SCRIPT"`
MWOFFLINER="$SCRIPT_DIR/mwoffliner.js"
MWMATRIXOFFLINER="$SCRIPT_DIR/mwmatrixoffliner.js --speed=4 --verbose --skipHtmlCache --adminEmail=contact@kiwix.org --mwUrl=https://meta.wikimedia.org/ --cacheDirectory=/data/scratch/mwoffliner/ --deflateTmpHtml --skipCacheCleaning"

# Wikisource
$MWMATRIXOFFLINER --project=wikisource --outputDirectory=$ZIM2INDEX/wikisource/ --language=fr &&

# Wikipedia
$MWMATRIXOFFLINER --project=wiki --outputDirectory=$ZIM2INDEX/wikipedia/ --language="(de|es|it)"