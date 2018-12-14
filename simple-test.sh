#!/bin/bash
cp ./articleList ../articleList


./bin/mwoffliner.script.js --mwUrl=https://en.wikipedia.org --adminEmail=admin@kiwix.com --localParsoid --redis=redis://127.0.0.1:6379 --format=nozim --articleList=../articleList

./node_modules/.bin/percy exec -- ./node_modules/.bin/mocha --exit

mv tmp ../test-run-change


git checkout master

rm -rf cac
redis-cli flushall

npm ci
npm run build
./bin/mwoffliner.script.js --mwUrl=https://en.wikipedia.org --adminEmail=admin@kiwix.com --localParsoid --redis=redis://127.0.0.1:6379 --format=nozim --articleList=../articleList
mv tmp ../test-run-master


(diff -r ../test-run-change ../test-run-master)

exit 0