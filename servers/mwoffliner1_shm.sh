#!/bin/sh

ZIM2INDEX=/srv/upload/zim2index/
SCRIPT=`readlink -f $0/../`
SCRIPT_DIR=`dirname "$SCRIPT"`
ARGS="--deflateTmpHtml --verbose --adminEmail=contact@kiwix.org --skipCacheCleaning --skipHtmlCache --tmpDirectory=/dev/shm/"
MWOFFLINER="$SCRIPT_DIR/mwoffliner.js --format= --format=nopic $ARGS"
MWMATRIXOFFLINER="$SCRIPT_DIR/mwmatrixoffliner.js --mwUrl=https://meta.wikimedia.org/ $ARGS"

# Wikibooks
$MWMATRIXOFFLINER --project=wikibooks --outputDirectory=$ZIM2INDEX/wikibooks/ &&

# Wikispecies
$MWMATRIXOFFLINER --project=species --outputDirectory=$ZIM2INDEX/wikispecies/ &&

# Wikisource
$MWMATRIXOFFLINER --project=wikisource --outputDirectory=$ZIM2INDEX/wikisource/ --language="(en|fr)" --languageInverter &&

# Wikivoyage
$MWMATRIXOFFLINER --project=wikivoyage --outputDirectory=$ZIM2INDEX/wikivoyage/ --languageInverter --language="(en)" &&

# Wikiquote
$MWMATRIXOFFLINER --project=wikiquote --outputDirectory=$ZIM2INDEX/wikiquote/ &&

# Wikiversity
$MWMATRIXOFFLINER --project=wikiversity --outputDirectory=$ZIM2INDEX/wikiversity/ &&

# Wikipedia
$MWMATRIXOFFLINER --project=wiki --outputDirectory=$ZIM2INDEX/wikipedia/ --languageInverter --language="(ar|bg|ceb|cs|da|de|el|en|eo|eu|et|es|fi|fr|gl|hu|hy|hi|hr|it|ja|kk|ms|min|nl|nn|no|ro|simple|sk|sl|sr|sh|tr|pl|pt|ru|sv|vi|war|fa|ca|ko|id|he|la|lt|uk|uz|zh)"
