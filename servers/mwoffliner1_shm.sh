#!/bin/sh

ZIM2INDEX=/srv/upload/zim2index/
SCRIPT=`readlink -f $0/../`
SCRIPT_DIR=`dirname "$SCRIPT"`
MWOFFLINER="$SCRIPT_DIR/mwoffliner.js"
MWMATRIXOFFLINER="$SCRIPT_DIR/mwmatrixoffliner.js --speed=3 --verbose --skipHtmlCache --adminEmail=contact@kiwix.org --mwUrl=http://meta.wikimedia.org/ --cacheDirectory=/data/project/cac/ --tmpDirectory=/dev/shm/ --skipCacheCleaning"

# Wikispecies
$MWMATRIXOFFLINER --parsoidUrl=http://parsoid-lb.eqiad.wikimedia.org/ --project=species --outputDirectory=$ZIM2INDEX/wikispecies/ &&

# Wikisource
$MWMATRIXOFFLINER  --parsoidUrl=http://rest.wikimedia.org/ --project=wikisource --outputDirectory=$ZIM2INDEX/wikisource/ --language=fr --languageInverter --deflateTmpHtml &&

# Wiktionary
$MWMATRIXOFFLINER  --parsoidUrl=http://rest.wikimedia.org/ --project=wiktionary --outputDirectory=$ZIM2INDEX/wiktionary/ --deflateTmpHtml
