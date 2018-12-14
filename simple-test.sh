#!/bin/bash
cp ./articleList ../articleList


./bin/mwoffliner.script.js --mwUrl=https://en.wikipedia.org --adminEmail=admin@kiwix.com --localParsoid --redis=redis://127.0.0.1:6379 --format=nozim --articleList=../articleList

./node_modules/.bin/percy exec -- ./node_modules/.bin/mocha --exit
