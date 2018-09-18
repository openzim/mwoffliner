#!/bin/sh
':' //# -*- mode: js -*-; exec /usr/bin/env node --max-old-space-size=9000 --stack-size=42000 "$0" "$@"

'use strict';

/* ********************************** */
/* MODULE VARIABLE SECTION ********** */
/* ********************************** */

import * as async from 'async';
import { http, https } from 'follow-redirects';
import urlParser from 'url';
import yargs from 'yargs';
import { exec } from 'child_process';
import { spawn } from 'child_process';

/* ********************************** */
/* COMMAND LINE PARSING ************* */
/* ********************************** */

const { argv } = yargs.usage('Mirror many mediawikis instances base on the matrix extension: $0'
	+ '\nExample: ./mwmatrixoffliner.js --mwUrl=https://meta.wikimedia.org/ --adminEmail=foo@bar.net [--parsoidUrl=https://rest.wikimedia.org/] [--project=wikivoyage] [--language=fr]')
	.require('mwUrl', '')
	.require('adminEmail', '')
	.describe('adminEmail', 'Email of the mwoffliner user which will be put in the HTTP user-agent string')
	.describe('deflateTmpHtml', 'To reduce I/O, HTML pages might be deflated in tmpDirectory.')
	.describe('keepHtml', 'If ZIM built, keep the temporary HTML directory')
	.describe('language', 'Language to dump (regex)')
	.describe('languageInverter', 'If given, select languages *not* matching the --language regex')
	.describe('languageTrigger', 'Ignore everything until this language is found')
	.describe('mwURL', 'Mediawiki API URL')
	.describe('outputDirectory', 'Directory to write the ZIM files')
	.describe('parsoidUrl', 'Mediawiki Parsoid URL')
	.describe('project', 'Projects to dump')
	.describe('projectInverter', 'If given, select projects *not* matching the --project regex')
	.describe('resume', 'Do not overwrite if ZIM file already created')
	.describe('speed', 'Multiplicator for the number of parallel HTTP requests on Parsoid backend (per default the number of CPU cores). The default value is 1.')
	.describe('tmpDirectory', 'Directory where files are temporary stored')
	.describe('cacheDirectory', 'Directory where files are permanently cached')
	.describe('skipCacheCleaning', 'Do not search for old/outdated files in the cache')
	.describe('verbose', 'Print debug information to the stdout')
	.describe('skipHtmlCache', 'Do not cache Parsoid HTML output (and do not use any cached HTML content)')
	.describe('withZimFullTextIndex', 'Include a fulltext search index to the ZIM')
	.describe('mobileLayout', 'HTML optimised for mobile mobile use')
	.strict();

/* Check if opt. binaries are available */
var optBinaries = ['xz --version', 'mv --version'];
optBinaries.forEach(function (cmd) {
	exec(cmd + ' 2>&1 > /dev/null', function (error, stdout, stderr) {
		if (error) {
			console.error('Failed to find binary "' + cmd.split(' ')[0] + '": (' + error + ')');
			process.exit(1);
		}
	});
});

/* ********************************** */
/* NEW PROTOTYPE ******************** */
/* ********************************** */

(<any>Array.prototype).clean = function (deleteValue) {
	for (var i = 0; i < this.length; i++) {
		if (this[i] == deleteValue) {
			this.splice(i, 1);
			i--;
		}
	}
	return this;
};

/* ********************************** */
/* CUSTOM VARIABLE SECTION ********** */
/* ********************************** */

const outputDirectory = argv.outputDirectory;
const tmpDirectory = argv.tmpDirectory;
const cacheDirectory = argv.cacheDirectory;
const parsoidUrl = (argv.parsoidUrl ? (argv.parsoidUrl[argv.parsoidUrl.length - 1] == '/' ? argv.parsoidUrl : argv.parsoidUrl + '/') : '');
const mwUrl = argv.mwUrl[argv.mwUrl.length - 1] == '/' ? argv.mwUrl : argv.mwUrl + '/';
const webUrl = mwUrl + 'wiki/';
const apiUrl = mwUrl + 'w/api.php?';
const matrixUrl = apiUrl + 'action=sitematrix&format=json';
const mediawikis = new Array();
const project = argv.project;
const projectRegexp = new RegExp('^' + (argv.project || '.*') + '$');
const projectInverter = argv.projectInverter || argv.projectInverter;
const languageRegexp = new RegExp('^' + (argv.language || '.*') + '$');
const languageInverter = argv.projectInverter || argv.languageInverter;
let languageTrigger = argv.languageTrigger;
const verbose = argv.verbose;
const adminEmail = argv.adminEmail;
const resume = argv.resume;
const speed = argv.speed;
const skipHtmlCache = argv.skipHtmlCache;
const skipCacheCleaning = argv.skipCacheCleaning;
const keepHtml = argv.keepHtml;
const deflateTmpHtml = argv.deflateTmpHtml;
const withZimFullTextIndex = argv.withZimFullTextIndex;
const withMobileLayout = argv.mobileLayout;

/************************************/
/* MAIN *****************************/
/************************************/

async.series(
	[
		function (finished) { init(finished) },
		function (finished) { loadMatrix(finished) },
		function (finished) { dump(finished) }
	],
	function (error) {
		if (error) {
			console.error('Unable to dump correctly all mediawikis (' + error + ')');
		} else {
			printLog('All mediawikis dump successfuly');
		}
	}
);

/************************************/
/* FUNCTIONS ************************/
/************************************/

function init(finished) {
	finished();
}

function dump(finished) {
	async.eachSeries(
		mediawikis,
		function (site, finished) {
			if ((!projectInverter && projectRegexp.test(site.code) || (projectInverter && !projectRegexp.test(site.code))) &&
				(!languageInverter && languageRegexp.test(site.lang) || (languageInverter && !languageRegexp.test(site.lang))) &&
				(!languageTrigger || languageTrigger == site.lang)
			) {
				languageTrigger = undefined;
				var localMwUrl = site.url + '/';
				var localParsoidUrl = '';
				if (parsoidUrl) {
					localParsoidUrl = parsoidUrl.indexOf('rest.wikimedia.org') < 0 ?
						parsoidUrl + site.dbname + '/' : parsoidUrl + urlParser.parse(site.url).hostname + '/v1/page/html/';
				} else {
					localParsoidUrl = site.url + '/api/rest_v1/page/html/';
				}

				printLog('Dumping ' + site.url);
				executeTransparently(__dirname + '/mwoffliner.script.js',
					(<any>[
						'--mwUrl=' + localMwUrl,
						'--parsoidUrl=' + localParsoidUrl,
						'--adminEmail=' + adminEmail,
						'--format=novid', '--format=nopic',
						outputDirectory ? '--outputDirectory=' + outputDirectory : undefined,
						tmpDirectory ? '--tmpDirectory=' + tmpDirectory : undefined,
						cacheDirectory ? '--cacheDirectory=' + cacheDirectory : undefined,
						verbose ? '--verbose' : undefined,
						resume ? '--resume' : undefined,
						deflateTmpHtml ? '--deflateTmpHtml' : undefined,
						skipHtmlCache ? '--skipHtmlCache' : undefined,
						withZimFullTextIndex ? '--withZimFullTextIndex' : undefined,
						withMobileLayout ? '--mobileLayout' : undefined,
						skipCacheCleaning ? '--skipCacheCleaning' : undefined,
						keepHtml ? '--keepHtml' : undefined,
						speed ? '--speed=' + speed : undefined,
						site.filenamePrefix ? '--filenamePrefix=' + site.filenamePrefix : undefined
					]).clean(undefined),
					function (executionError) {
						if (executionError) {
							console.error(executionError);
							process.exit(1);
						} else {
							finished();
						}
					});
			} else {
				finished()
			}
		},
		function (error) {
			finished(error);
		}
	)
}

function loadMatrix(finished) {
	downloadContent(matrixUrl, function (json) {
		if (!JSON.parse(json)['error']) {
			var entries = JSON.parse(json)['sitematrix'];
			Object.keys(entries).map(function (entryKey) {
				var entry = entries[entryKey];
				if (typeof entryKey === 'string') {
					if (entryKey == 'specials') {
						entry.map(function (site) {
							if (site.closed === undefined) {
								site.lan = 'en';
								if (site.code == 'species') {
									site.filenamePrefix = 'wikispecies_en';
								} else {
									site.filenamePrefix = site.dbname + '_en';
								}
								mediawikis.push(site);
							}
						});
					}
				} else {
					entry.site.map(function (site) {
						if (site.closed === undefined) {
							if (entry.code == 'simple') {
								site.filenamePrefix = site.sitename.toLowerCase() + '_en_simple';
							}
							site.lang = entry.code;
							mediawikis.push(site);
						}
					});
				}
			});
			printLog('Matrix loaded successfuly');
			finished();
		} else {
			console.error('Unable to parse the matrix JSON from ' + matrixUrl);
			process.exit(1);
		}
	});
}

function downloadContent(url, callback) {
	var retryCount = 1;

	async.retry(
		5,
		function (finished) {
			var calledFinished = false;
			function callFinished(timeout, message, data?) {
				if (!calledFinished) {
					calledFinished = true;
					setTimeout(finished, timeout, message, data);
				}
			}

			https.get(url, function (response) {
				if (response.statusCode == 200) {
					var data = '';

					response.on('data', function (chunk) {
						data += chunk;
					});
					response.on('end', function () {
						callFinished(0, null, data);
					});
				} else {
					var message = 'Unable to donwload content [' + retryCount + '] ' + decodeURI(url) + ' (statusCode=' + response.statusCode + ').';
					console.error(message);
					callFinished(0, message);
				}
			})
				.on('error', function (error) {
					var message = 'Unable to download content [' + retryCount + '] ' + decodeURI(url) + ' ( ' + error + ' ).';
					console.error(message);
					callFinished(0, message);
				})
				.on('socket', function (socket) {
					var req = this;
					socket.setTimeout(50000 * ++retryCount);
					if (!socket.custom) {
						socket.custom = true;
						socket.addListener('timeout', function () {
							var message = 'Unable to download content [' + retryCount + '] ' + decodeURI(url) + ' (socket timeout)';
							console.error(message);
							callFinished(2000, message);
						});
						socket.addListener('error', function (error) {
							var message = 'Unable to download content [' + retryCount + '] ' + decodeURI(url) + ' (socket error)';
							console.error(message);
							callFinished(2000, message);
						});
					}
				});
		},
		function (error, data) {
			if (error) {
				console.error("Absolutly unable to retrieve async. URL. " + error);
			}
			if (callback) {
				setTimeout(callback, 0, data);
			}
		});
}

function executeTransparently(command, args, callback, nostdout?, nostderr?) {
	printLog('Executing command: ' + command + ' ' + args.join(' '));

	try {
		var proc = spawn(command, args)
			.on('error', function (error) {
				console.error('Error in executeTransparently(), ' + error);
				process.exit(1);
			});

		if (!nostdout) {
			proc.stdout
				.on('data', function (data) {
					console.log(String(data).replace(/[\n\r]$/g, ''));
				})
				.on('error', function (error) {
					console.error('STDOUT output error: ' + error);
				});
		}

		if (!nostderr) {
			proc.stderr
				.on('data', function (data) {
					console.error(String(data).replace(/[\n\r]$/g, ''));
				})
				.on('error', function (error) {
					console.error('STDERR output error: ' + error);
				});
		}

		proc.on('close', function (code) {
			callback(code !== 0 ? 'Error when executing ' + command : undefined);
		});
	} catch (error) {
		callback('Error when executing ' + command);
	}
}

function printLog(msg) {
	if (verbose) {
		console.log(msg);
	}
}
