#!/bin/sh
':' //# -*- mode: js -*-; exec /usr/bin/env node --max-old-space-size=9000 --stack-size=42000 "$0" "$@"

'use strict';

const yargs = require('yargs');
const mwofflinerLib = require('../lib/mwoffliner.lib.js');

/************************************/
/* Command Parsing ******************/
/************************************/

const parameterList = require('../lib/parameterList').default;

let argv = yargs
    .usage(
        `Create a fancy HTML dump of a Mediawiki instance in a directory or as a ZIM file
Usage: $0
Example, as a system tool:
    mwoffliner --mwUrl=https://en.wikipedia.org/ --adminEmail=foo@bar.net
Or, as a node script:
    node mwoffliner.js --mwUrl=https://en.wikipedia.org/ --adminEmail=foo@bar.net
Or, as a npm script: '
    npm run mwoffliner -- --mwUrl=https://en.wikipedia.org/ --adminEmail=foo@bar.net`
    )
    .require(parameterList.filter(param => param.required).map(param => param.name));
yargs.version(() => {
    const packageJSON = require('../package');
    const version = packageJSON.version;
    const revision = packageJSON.gitRevision;

    return `Version:\t${version}\nGit Revision:\t${revision}`;
});
yargs.help();

parameterList.forEach(param => argv.describe(param.name, param.description));

argv = argv.strict().argv;

const execStartTime = Date.now();

mwofflinerLib.execute(argv)
    .then(() => {
        console.info(`Finished running mwoffliner after [${Math.round((Date.now() - execStartTime) / 1000)}s]`);
        process.exit(0);
    })
    .catch(err => {
        console.error(`Failed to run mwoffliner after [${Math.round((Date.now() - execStartTime) / 1000)}s]:`, JSON.stringify(err, null, '\t'));
        process.exit(2);
    });
