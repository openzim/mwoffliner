#!/bin/sh

ZIM2INDEX=`readlink -f $1`
SCRIPT=`readlink -f $0`
SCRIPT_DIR=`dirname "$SCRIPT"`
MWOFFLINER="$SCRIPT_DIR/mwoffliner.js"
MWMATRIXOFFLINER="$SCRIPT_DIR/mwmatrixoffliner.js"

# Few checks
if [ $# -lt 1 ]
then
    echo "Not enough argument. This script need as first and only argument the full path of the 'zim2index' directory where the produced ZIM files need to be moved"
    exit 1;
else
    if [ -d "$ZIM2INDEX" ]
    then
	echo "Target directory for ZIM file is '$ZIM2INDEX'"
    else
	echo "Unable to find or to write into directory '$ZIM2INDEX'"
	exit 1;
    fi
fi

# Wikivoyage
$MWMATRIXOFFLINER --mwUrl=http://meta.wikimedia.org/ --parsoidUrl=http://parsoid-lb.eqiad.wikimedia.org/ --project=wikivoyage --outputDirectory=$ZIM2INDEX/wikivoyage/

# Wikinews
$MWMATRIXOFFLINER --mwUrl=http://meta.wikimedia.org/ --parsoidUrl=http://parsoid-lb.eqiad.wikimedia.org/ --project=wikinews --outputDirectory=$ZIM2INDEX/wikinews/

# Wikiquote
$MWMATRIXOFFLINER --mwUrl=http://meta.wikimedia.org/ --parsoidUrl=http://parsoid-lb.eqiad.wikimedia.org/ --project=wikiquote --outputDirectory=$ZIM2INDEX/wikiquote/

# Wikiversity
$MWMATRIXOFFLINER --mwUrl=http://meta.wikimedia.org/ --parsoidUrl=http://parsoid-lb.eqiad.wikimedia.org/ --project=wikiversity --outputDirectory=$ZIM2INDEX/wikiversity/

# Wikibooks
$MWMATRIXOFFLINER --mwUrl=http://meta.wikimedia.org/ --parsoidUrl=http://parsoid-lb.eqiad.wikimedia.org/ --project=wikibooks --outputDirectory=$ZIM2INDEX/wikibooks/

# Wikispecies
$MWOFFLINER --mwUrl=http://species.wikimedia.org/ --parsoidUrl=http://parsoid-lb.eqiad.wikimedia.org/species/ --format= --format=nopic --outputDirectory=species --filenamePrefix="wikispecies_en_all"
mv species/*.zim $ZIM2INDEX/wikispecies