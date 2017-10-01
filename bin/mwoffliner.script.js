#!/bin/sh
':' //# -*- mode: js -*-; exec /usr/bin/env node --max_inlined_source_size=100000 --max-old-space-size=9000 --stack-size=42000 "$0" "$@"

'use strict';

const yargs = require('yargs');
const mwofflinerLib = require('../lib/mwoffliner.lib.js');

/************************************/
/* Command Parsing ******************/
/************************************/

const { parameterList } = require('../lib/parameterList');

let argv = yargs
  .usage(
    `Create a fancy HTML dump of a Mediawiki instance in a directory or as a ZIM file
Usage: $0'
Example, as a system tool:
    mwoffliner --mwUrl=https://en.wikipedia.org/ --adminEmail=foo@bar.net
Or, as a node script:
    node mwoffliner.js --mwUrl=https://en.wikipedia.org/ --adminEmail=foo@bar.net
Or, as a npm script: '
    npm run mwoffliner -- --mwUrl=https://en.wikipedia.org/ --adminEmail=foo@bar.net`
  )
  .require(parameterList.filter(param => param.required).map(param => param.name));

parameterList.forEach(param => argv.describe(param.name, param.description));

argv = argv.strict().argv;

mwofflinerLib.execute(argv);
