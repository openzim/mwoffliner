#!/bin/bash
echo "Building at [$(date)]"
npx tsc -p tsconfig.build.json
# Remove tslint disable
npx replace "\/\/ tslint:disable-next-line\n" "" ./lib/cli.js
# typescript compiler adds a semicolon to the second line we need to remove that too
npx replace "':'; //#" "':' //#" ./lib/cli.js
chmod +x ./lib/cli.js
echo "Build Complete at [$(date)]"
