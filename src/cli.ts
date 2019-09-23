#!/bin/sh
// tslint:disable-next-line
':' //# -*- mode: js -*-; exec /usr/bin/env node --max-old-space-size=9000 --stack-size=42000 "$0" "$@"

'use strict';

import yargs from 'yargs';
import { parameterDescriptions, requiredParams } from './parameterList';

/************************************/
/* Command Parsing ******************/
/************************************/

const argv = yargs
  .help('help')
  .usage(
    `Create a fancy HTML dump of a Mediawiki instance in a directory or as a ZIM file
  Usage: $0
  Example, as a system tool:
  mwoffliner --mwUrl=https://en.wikipedia.org/ --adminEmail=foo@bar.net
  Or, as a node script:
  node mwoffliner.js --mwUrl=https://en.wikipedia.org/ --adminEmail=foo@bar.net
  Or, as a npm script: '
  npm run mwoffliner -- --mwUrl=https://en.wikipedia.org/ --adminEmail=foo@bar.net`,
  )
  .describe(parameterDescriptions)
  .require(requiredParams as any)
  .strict().argv;

/* ***********************************/
/* TMPDIR OVERRIDE HAS TO BE HANDLED */
/* AT THE REALLY BEGIN               */
/* ***********************************/

import fs, { readFileSync } from 'fs';
import logger from './Logger';

if (argv.osTmpDir) {
  const osTmpDir = argv.osTmpDir as string;

  try {
    if (fs.statSync(osTmpDir)) {
      process.env.TMPDIR = osTmpDir;
    } else {
      throw new Error();
    }
  } catch {
    console.error(`--osTmpDir value [${osTmpDir}] is not valid`);
    process.exit(2);
  }
}

/* ***********************************/
/* GO THROUGH ENTRY POINT            */
/* ***********************************/

const execStartTime = Date.now();

import * as  mwofflinerLib from './mwoffliner.lib';

mwofflinerLib
  .execute(argv)
  .then(() => {
    console.info(
      `Finished running mwoffliner after [${Math.round(
        (Date.now() - execStartTime) / 1000,
      )}s]`,
    );
    process.exit(0);
  })
  .catch((err) => {
    let loggableErr = err;
    try {
      loggableErr = JSON.stringify(err, null, '\t');
    } catch (err) {
      /* NOOP */
    }
    console.error(
      `Failed to run mwoffliner after [${Math.round(
        (Date.now() - execStartTime) / 1000,
      )}s]:`,
      loggableErr,
    );
    if (err && err.message) {
      console.error(`\n\n**********\n\n${err.message}\n\n**********\n\n`);
    }
    process.exit(2);
  });

// Hack to allow serializing of Errors
// https://stackoverflow.com/questions/18391212/is-it-not-possible-to-stringify-an-error-using-json-stringify
if (!('toJSON' in Error.prototype)) {
  Object.defineProperty(Error.prototype, 'toJSON', {
    value() {
      const alt = {} as any;

      Object.getOwnPropertyNames(this).forEach(function (key) {
        alt[key] = this[key];
      }, this);

      return alt;
    },
    configurable: true,
    writable: true,
  });
}
