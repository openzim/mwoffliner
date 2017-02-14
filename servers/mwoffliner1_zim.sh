#!/bin/sh

ZIM2INDEX=/srv/upload/zim2index/
SCRIPT=`readlink -f $0/../`
SCRIPT_DIR=`dirname "$SCRIPT"`
ARGS="--adminEmail=contact@kiwix.org --deflateTmpHtml --verbose --skipHtmlCache --skipCacheCleaning"
MWOFFLINER="$SCRIPT_DIR/mwoffliner.js --format= --format=nopic $ARGS"
MWMATRIXOFFLINER="$SCRIPT_DIR/mwmatrixoffliner.js --mwUrl=https://meta.wikimedia.org/ $ARGS"

# Wikipedia
$MWMATRIXOFFLINER --project=wiki --outputDirectory=$ZIM2INDEX/wikipedia/ --language="(ca|ceb|fa|id|ro|sh|war|zh)"
