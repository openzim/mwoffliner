#!/usr/bin/env -S node --max-old-space-size=9000 --stack-size=42000

'use strict'

import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import { parameterDescriptions, requiredParams } from './parameterList.js'
import * as logger from './Logger.js'

import * as mwofflinerLib from './mwoffliner.lib.js'

/** **********************************/
/* Command Parsing ******************/
/** **********************************/
const argv: any = yargs(hideBin(process.argv))
  .help('help')
  .usage(
    `Create a fancy HTML dump of a Mediawiki instance in a ZIM file
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
  .strict().argv

/* ***********************************/
/* TMPDIR OVERRIDE HAS TO BE HANDLED */
/* AT THE REALLY BEGIN               */
/* ***********************************/

import fs from 'fs'
;(process as any).verbose = argv.verbose

if (argv.osTmpDir) {
  const osTmpDir = argv.osTmpDir as string

  try {
    if (fs.statSync(osTmpDir)) {
      process.env.TMPDIR = osTmpDir
    } else {
      throw new Error()
    }
  } catch {
    logger.error(`--osTmpDir value [${osTmpDir}] is not valid`)
    process.exit(2)
  }
}

/* ***********************/
/* TESTING ALL ARGUMENTS */
/* ***********************/

import { sanitize_all } from './sanitize-argument.js'
const execStartTime = Date.now()
sanitize_all(argv)
  .then(() => {
    /* ***********************************/
    /* GO THROUGH ENTRY POINT            */
    /* ***********************************/

    mwofflinerLib
      .execute(argv)
      .then(() => {
        logger.info(`Finished running mwoffliner after [${Math.round((Date.now() - execStartTime) / 1000)}s]`)
        process.exit(0)
      })
      .catch((err) => {
        errorHandler(err)
      })
  })
  .catch((err) => {
    errorHandler(err)
  })

// Hack to allow serializing of Errors
// https://stackoverflow.com/questions/18391212/is-it-not-possible-to-stringify-an-error-using-json-stringify
if (!('toJSON' in Error.prototype)) {
  Object.defineProperty(Error.prototype, 'toJSON', {
    value() {
      const alt = {} as any

      Object.getOwnPropertyNames(this).forEach(function (key) {
        alt[key] = this[key]
      }, this)

      return alt
    },
    configurable: true,
    writable: true,
  })
}

function errorHandler(err: any) {
  let loggableErr = err
  try {
    loggableErr = JSON.stringify(err, null, '\t')
  } catch (err) {
    /* NOOP */
  }
  logger.error(`Failed to run mwoffliner after [${Math.round((Date.now() - execStartTime) / 1000)}s]:`, loggableErr)
  if (err && err.message) {
    logger.error(`\n\n**********\n\n${err.message}\n\n**********\n\n`)
  }
  process.exit(2)
}
