#!/bin/sh
':'; //# -*- mode: js -*-; exec /usr/bin/env node --max-old-space-size=9000 --stack-size=42000 "$0" "$@"
'use strict';
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var yargs_1 = require("yargs");
var mwoffliner_lib_1 = require("./lib/mwoffliner.lib");
/* ********************************** */
/* Command Parsing ****************** */
/* ********************************** */
var parameterList_1 = __importDefault(require("./lib/parameterList"));
var argv = yargs_1.usage("Create a fancy HTML dump of a Mediawiki instance in a directory or as a ZIM file\nUsage: $0\nExample, as a system tool:\n    mwoffliner --mwUrl=https://en.wikipedia.org/ --adminEmail=foo@bar.net\nOr, as a node script:\n    node mwoffliner.js --mwUrl=https://en.wikipedia.org/ --adminEmail=foo@bar.net\nOr, as a npm script: '\n    npm run mwoffliner -- --mwUrl=https://en.wikipedia.org/ --adminEmail=foo@bar.net");
parameterList_1.default.filter(function (param) { return param.required; }).reduce(function (argv, param) {
    return argv.require(param.name, param.description);
}, argv);
yargs_1.version(); // Enable --version using value from package.json
yargs_1.help();
parameterList_1.default.forEach(function (param) { return argv.describe(param.name, param.description); });
argv = argv.strict().argv;
mwoffliner_lib_1.execute(argv);
