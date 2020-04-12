#!/bin/bash
echo "Building at [$(date)]"
npx tsc -p tsconfig.build.json
# Remove tslint disable
npx replace "\/\/ tslint:disable-next-line\n" "" ./lib/src/cli.js
# typescript compiler adds a semicolon to the second line we need to remove that too
npx replace "':'; //#" "':' //#" ./lib/src/cli.js
chmod +x ./lib/src/cli.js
echo "Build Complete at [$(date)]"
