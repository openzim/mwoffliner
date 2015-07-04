#!/bin/sh

ZIM2INDEX=/srv/upload/zim2index/
SCRIPT=`readlink -f $0/../`
SCRIPT_DIR=`dirname "$SCRIPT"`
MWOFFLINER="$SCRIPT_DIR/mwoffliner.js"
MWMATRIXOFFLINER="$SCRIPT_DIR/mwmatrixoffliner.js --speed=3 --verbose --skipHtmlCache --adminEmail=contact@kiwix.org --mwUrl=https://meta.wikimedia.org/ --parsoidUrl=https://rest.wikimedia.org/ --cacheDirectory=/data/scratch/mwoffliner/cac/ --tmpDirectory=/dev/shm/ --skipCacheCleaning"

# Wikispecies
$MWMATRIXOFFLINER --project=species --outputDirectory=$ZIM2INDEX/wikispecies/ &&

# Wikisource
$MWMATRIXOFFLINER  --project=wikisource --outputDirectory=$ZIM2INDEX/wikisource/ --language=fr --languageInverter --deflateTmpHtml &&

# Wikibooks
$MWMATRIXOFFLINER --project=wikibooks --outputDirectory=$ZIM2INDEX/wikibooks/ &&

# Wiktionary
$MWMATRIXOFFLINER  --project=wiktionary --outputDirectory=$ZIM2INDEX/wiktionary/  --language="(en|fr|mg)" --languageInverter --deflateTmpHtml
