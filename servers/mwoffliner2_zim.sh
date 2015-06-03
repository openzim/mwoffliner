#!/bin/sh

ZIM2INDEX=/srv/upload/zim2index/
SCRIPT=`readlink -f $0/../`
SCRIPT_DIR=`dirname "$SCRIPT"`
MWOFFLINER="$SCRIPT_DIR/mwoffliner.js"
MWMATRIXOFFLINER="$SCRIPT_DIR/mwmatrixoffliner.js --speed=3 --verbose --skipHtmlCache --adminEmail=contact@kiwix.org --mwUrl=http://meta.wikimedia.org/ --parsoidUrl=http://rest.wikimedia.org/ --cacheDirectory=/data/project/cac/ --deflateTmpHtml --skipCacheCleaning"

# Wikipedia
$MWMATRIXOFFLINER --project=wiki --outputDirectory=$ZIM2INDEX/wikipedia/ --language="(ca|ko|hu)"
