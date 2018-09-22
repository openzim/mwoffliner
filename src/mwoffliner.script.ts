#!/bin/sh
':' //# -*- mode: js -*-; exec /usr/bin/env node --max-old-space-size=9000 --stack-size=42000 "$0" "$@"

'use strict';

import { Arguments, Argv, help, usage, version } from 'yargs';
import { execute } from './lib/mwoffliner.lib';

/* ********************************** */
/* Command Parsing ****************** */
/* ********************************** */

import parameterList from './lib/parameterList';

let argv: Argv | Arguments = usage(
    `Create a fancy HTML dump of a Mediawiki instance in a directory or as a ZIM file
Usage: $0
Example, as a system tool:
    mwoffliner --mwUrl=https://en.wikipedia.org/ --adminEmail=foo@bar.net
Or, as a node script:
    node mwoffliner.js --mwUrl=https://en.wikipedia.org/ --adminEmail=foo@bar.net
Or, as a npm script: '
    npm run mwoffliner -- --mwUrl=https://en.wikipedia.org/ --adminEmail=foo@bar.net`
);

parameterList
    .filter((param) => param.required)
    .reduce((argv, param) => {
        return argv.require(param.name, param.description);
    }, argv);

version(); // Enable --version using value from package.json
help();

parameterList.forEach((param) => argv.describe(param.name, param.description));

argv = argv.strict().argv;

execute(argv);
