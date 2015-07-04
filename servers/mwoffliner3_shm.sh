#!/bin/sh

ZIM2INDEX=/srv/upload/zim2index/
SCRIPT=`readlink -f $0/../`
SCRIPT_DIR=`dirname "$SCRIPT"`
MWOFFLINER="$SCRIPT_DIR/mwoffliner.js"
MWMATRIXOFFLINER="$SCRIPT_DIR/mwmatrixoffliner.js --speed=3 --verbose --skipHtmlCache --adminEmail=contact@kiwix.org --mwUrl=https://meta.wikimedia.org/ --parsoidUrl=https://rest.wikimedia.org/ --cacheDirectory=/data/scratch/mwoffliner/cac/ --tmpDirectory=/dev/shm/ --skipCacheCleaning"

# Wikivoyage
$MWMATRIXOFFLINER --project=wikivoyage --outputDirectory=$ZIM2INDEX/wikivoyage/ &&

# Wikinews
$MWMATRIXOFFLINER --project=wikinews --outputDirectory=$ZIM2INDEX/wikinews/ &&

# Wikiquote
$MWMATRIXOFFLINER --project=wikiquote --outputDirectory=$ZIM2INDEX/wikiquote/ &&

# Wikiversity
$MWMATRIXOFFLINER --project=wikiversity --outputDirectory=$ZIM2INDEX/wikiversity/ &&

# Wikipedia
$MWMATRIXOFFLINER --deflateTmpHtml --project=wiki --outputDirectory=$ZIM2INDEX/wikipedia/ --languageInverter --language="(en|es|de|ru|ja|fr|zh|it|ar|bg|cs|da|et|el|eo|eu|gl|hy|hi|hr|ms|min|nn|uz|kk|ro|simple|sk|sl|sr|sh|fi|tr|vo|pl|pt|nl|ceb|sv|vi|war|fa|ca|ko|id|he|la|lt|hu|no|uk)"
