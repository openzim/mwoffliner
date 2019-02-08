#!/bin/bash
cp ./articleList ../articleList

echo "Scraping with --format=nozim"
./bin/mwoffliner.script.js --mwUrl=https://en.wikipedia.org --adminEmail=admin@kiwix.com --redis=redis://127.0.0.1:6379 --format=nozim --articleList=../articleList

echo "Scraping and creating ZIM"
./bin/mwoffliner.script.js --mwUrl=https://en.wikipedia.org --adminEmail=admin@kiwix.com --redis=redis://127.0.0.1:6379 --articleList=../articleList

./node_modules/.bin/percy exec -- ./node_modules/.bin/mocha --exit
