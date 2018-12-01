#!/bin/bash

./bin/mwoffliner.script.js --mwUrl=https://en.wikipedia.org --adminEmail=admin@kiwix.com --localParsoid --verbose --format=nozim --articleList=./articleList
mv tmp ../test-run-change

npm i -g mwoffliner
mwoffliner --mwUrl=https://en.wikipedia.org --adminEmail=admin@kiwix.com --localParsoid --verbose --format=nozim --articleList=./articleList
mv tmp ../test-run-master


diff ../test-run-change ../test-run-master