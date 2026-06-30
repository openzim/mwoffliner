#!/bin/bash
set -e
echo "Building at [$(date)]"
npx tsc -p tsconfig.build.json
chmod +x ./lib/cli.js
echo "Build Complete at [$(date)]"
