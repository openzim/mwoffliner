#!/bin/sh

ZIM2INDEX=/srv/upload/zim2index/
SCRIPT=`readlink -f $0/../`
SCRIPT_DIR=`dirname "$SCRIPT"`
ARGS="--adminEmail=contact@kiwix.org --deflateTmpHtml --verbose --skipHtmlCache --skipCacheCleaning"
MWOFFLINER="$SCRIPT_DIR/mwoffliner.js --format= --format=nopic $ARGS"
MWMATRIXOFFLINER="$SCRIPT_DIR/mwmatrixoffliner.js --mwUrl=https://meta.wikimedia.org/ $ARGS"

# Wikipedia in English
$MWOFFLINER --mwUrl="https://en.wikipedia.org/" --parsoidUrl="https://en.wikipedia.org/api/rest_v1/page/html/" --customMainPage="user:Popo_le_Chien/Kiwix" --outputDirectory=$ZIM2INDEX/wikipedia/
