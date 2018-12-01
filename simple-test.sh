#!/bin/bash

./bin/mwoffliner.script.js --mwUrl=https://en.wikipedia.org --adminEmail=admin@kiwix.com --localParsoid --redis=redis://127.0.0.1:6379 --verbose --format=nozim --articleList=./articleList
mv tmp ../test-run-change

git checkout master
./bin/mwoffliner.script.js --mwUrl=https://en.wikipedia.org --adminEmail=admin@kiwix.com --localParsoid --redis=redis://127.0.0.1:6379 --verbose --format=nozim --articleList=./articleList
mv tmp ../test-run-master


diff -r ../test-run-change ../test-run-master