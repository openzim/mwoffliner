#!/bin/sh

# Wikivoyage
./mwmatrixoffliner.js --mwUrl=http://meta.wikimedia.org/ --parsoidUrl=http://parsoid-lb.eqiad.wikimedia.org/ --project=wikivoyage --outputDirectory=/var/www/zimfarm.kiwix.org/upload/zim2index/wikivoyage/

# Wikinews
./mwmatrixoffliner.js --mwUrl=http://meta.wikimedia.org/ --parsoidUrl=http://parsoid-lb.eqiad.wikimedia.org/ --project=wikinews --outputDirectory=/var/www/zimfarm.kiwix.org/upload/zim2index/wikinews/

# Wikiquote
./mwmatrixoffliner.js --mwUrl=http://meta.wikimedia.org/ --parsoidUrl=http://parsoid-lb.eqiad.wikimedia.org/ --project=wikiquote --outputDirectory=/var/www/zimfarm.kiwix.org/upload/zim2index/wikiquote/

# Wikiversity
./mwmatrixoffliner.js --mwUrl=http://meta.wikimedia.org/ --parsoidUrl=http://parsoid-lb.eqiad.wikimedia.org/ --project=wikiversity --outputDirectory=/var/www/zimfarm.kiwix.org/upload/zim2index/wikiversity/

# Wikibooks
./mwmatrixoffliner.js --mwUrl=http://meta.wikimedia.org/ --parsoidUrl=http://parsoid-lb.eqiad.wikimedia.org/ --project=wikibooks --outputDirectory=/var/www/zimfarm.kiwix.org/upload/zim2index/wikibooks/

# Wikispecies
./mwoffliner.js --mwUrl=http://species.wikimedia.org/ --parsoidUrl=http://parsoid-lb.eqiad.wikimedia.org/species/ --format= --format=nopic --outputDirectory=species --filenamePrefix="wikispecies_en_all"
mv species/*.zim /var/www/zimfarm.kiwix.org/upload/zim2index/wikispecies