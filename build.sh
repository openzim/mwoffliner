#!/bin/bash
echo "Building at [$(date)]"
./node_modules/.bin/tsc
echo "Build Complete at [$(date)]"
