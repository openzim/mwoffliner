#!/bin/sh

ZIM2INDEX=/srv/upload/zim2index/
SCRIPT=`readlink -f $0/../`
SCRIPT_DIR=`dirname "$SCRIPT"`
MWOFFLINER="$SCRIPT_DIR/mwoffliner.js --adminEmail=contact@kiwix.org --deflateTmpHtml --verbose --skipCacheCleaning --format= --format=nopic --cacheDirectory=/data/scratch/mwoffliner/cac/"
MWMATRIXOFFLINER="$SCRIPT_DIR/mwmatrixoffliner.js --verbose --adminEmail=contact@kiwix.org --mwUrl=https://meta.wikimedia.org/ --cacheDirectory=/data/scratch/mwoffliner/cac/ --deflateTmpHtml --skipCacheCleaning"

# Wikisource
$MWMATRIXOFFLINER --project=wikisource --outputDirectory=$ZIM2INDEX/wikisource/ --language="(en|fr)" &&

# Wikipedia
$MWMATRIXOFFLINER --project=wiki --outputDirectory=$ZIM2INDEX/wikipedia/ --language="(sv|vi)"
