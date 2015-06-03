#!/bin/sh

ZIM2INDEX=/srv/upload/zim2index/
SCRIPT=`readlink -f $0/../`
SCRIPT_DIR=`dirname "$SCRIPT"`
MWOFFLINER="$SCRIPT_DIR/mwoffliner.js"
MWMATRIXOFFLINER="$SCRIPT_DIR/mwmatrixoffliner.js --speed=3 --verbose --skipHtmlCache --adminEmail=contact@kiwix.org --mwUrl=http://meta.wikimedia.org/ --cacheDirectory=/data/project/cac/ --tmpDirectory=/dev/shm/ --skipCacheCleaning"

# Wikivoyage
$MWMATRIXOFFLINER --parsoidUrl=http://parsoid-lb.eqiad.wikimedia.org/ --project=wikivoyage --outputDirectory=$ZIM2INDEX/wikivoyage/ &&

# Wikinews
$MWMATRIXOFFLINER --parsoidUrl=http://parsoid-lb.eqiad.wikimedia.org/ --project=wikinews --outputDirectory=$ZIM2INDEX/wikinews/ &&

# Wikiquote
$MWMATRIXOFFLINER --parsoidUrl=http://parsoid-lb.eqiad.wikimedia.org/ --project=wikiquote --outputDirectory=$ZIM2INDEX/wikiquote/ &&

# Wikiversity
$MWMATRIXOFFLINER --parsoidUrl=http://parsoid-lb.eqiad.wikimedia.org/ --project=wikiversity --outputDirectory=$ZIM2INDEX/wikiversity/ &&

# Wikibooks
$MWMATRIXOFFLINER --parsoidUrl=http://parsoid-lb.eqiad.wikimedia.org/ --project=wikibooks --outputDirectory=$ZIM2INDEX/wikibooks/ &&

# Wikipedia
$MWMATRIXOFFLINER --parsoidUrl=http://rest.wikimedia.org/ --deflateTmpHtml --project=wiki --outputDirectory=$ZIM2INDEX/wikipedia/ --languageInverter --language="(en|es|de|ru|ja|fr|zh|it|ar|bg|cs|da|et|el|eo|eu|gl|hy|hi|hr|ms|min|nn|uz|kk|ro|simple|sk|sl|sr|sh|fi|tr|vo|pl|pt|nl|ceb|sv|vi|war|fa|ca|ko|id|he|la|lt|hu|no|uk)"
