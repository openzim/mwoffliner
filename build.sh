#!/bin/bash
echo "Building at [$(date)]"
npx tsc
npx replace "':'; //#" "':' //#" ./lib/cli.js 
echo "Build Complete at [$(date)]"
