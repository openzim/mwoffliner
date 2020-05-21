#!/bin/bash

node \
  --max-old-space-size=65536 \
  -r ts-node/register src/cli.ts \
  --adminEmail=admin@kiwix.org \
  --mwUrl=http://en.wikipedia.org/ \
  --customZimFavicon=https://en.wikipedia.org/static/images/project-logos/enwiki.png \
  --customZimDescription=offline version of Wikipedia in English \
  --customZimTitle=Wikipedia \
  --customMainPage=User:The_other_Kiwix_guy/Landing \
  --useDownloadCache \
  --downloadCacheDirectory=cache \
  --format=nopic:nopic | \

jq -cR -r '. as $line | try fromjson catch {"stdout": $line}' | \

./node_modules/.bin/pino-pg \
  --connectionUrl postgres://postgres:rqpw8BXAWrBafT@localhost:5432/logger \
  --table log \
  --column item
