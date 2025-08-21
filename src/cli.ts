#!/usr/bin/env -S node --max-old-space-size=9000 --stack-size=42000 --enable-source-maps

'use strict'

import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import { parameterDescriptions, requiredParams } from './parameterList.js'
import * as logger from './Logger.js'
import { AxiosError } from 'axios'
import { cleanupAxiosError } from './util/misc.js'

import * as mwofflinerLib from './mwoffliner.lib.js'

/** **********************************/
/* Command Parsing ******************/
/** **********************************/
const argv: any = yargs(hideBin(process.argv))
  .help('help')
  .usage(
    `Create a look-alike HTML - ZIM file based - snapshot of a remote MediaWiki instance.

Usage: npm run mwoffliner -- --help`,
  )
  .describe(parameterDescriptions)
  .demandOption(requiredParams)
  .deprecateOption('mwWikiPath')
  .deprecateOption('mwIndexPhpPath')
  .strict().argv

/* ***********************************/
/* TMPDIR OVERRIDE HAS TO BE HANDLED */
/* AT THE REALLY BEGIN               */
/* ***********************************/

import fs from 'fs'

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

/* ***********************************/
/* PERFORMING STATIC ARGUMENTS TESTS */
/* ***********************************/

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
  if (err instanceof AxiosError) {
    err = cleanupAxiosError(err)
  }
  logger.error(`Failed to run mwoffliner after [${Math.round((Date.now() - execStartTime) / 1000)}s]:\n`, err)
  process.exit(2)
}
