#!/bin/sh

ZIM2INDEX=/srv/upload/zim2index/
SCRIPT=`readlink -f $0/../`
SCRIPT_DIR=`dirname "$SCRIPT"`
MWOFFLINER="$SCRIPT_DIR/mwoffliner.js"
MWMATRIXOFFLINER="$SCRIPT_DIR/mwmatrixoffliner.js --verbose --speed=3 --skipHtmlCache --deflateTmpHtml --adminEmail=contact@kiwix.org --mwUrl=https://meta.wikimedia.org/ --parsoidUrl=http://rest.wikimedia.org/ --cacheDirectory=/data/scratch/mwoffliner/cac/ --tmpDirectory=/dev/shm/ --skipCacheCleaning"

# Wikipedia
$MWMATRIXOFFLINER --project=wiki --outputDirectory=$ZIM2INDEX/wikipedia/ --language="(ar|bg|cs|da|et|el|eo|eu|gl|he|hy|hi|hr|id|fa|lt|la|ms|min|nn|no|uz|kk|ro|simple|sk|sl|sr|sh|fi|uk|tr|vo)"