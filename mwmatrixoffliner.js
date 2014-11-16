#!/usr/bin/env node
"use strict";

/************************************/
/* MODULE VARIABLE SECTION **********/
/************************************/

var fs = require( 'fs' );
var async = require( 'async' );
var http = require( 'follow-redirects' ).http;
var urlParser = require( 'url' );
var pathParser = require( 'path' );
var homeDirExpander = require( 'expand-home-dir' );
var countryLanguage = require( 'country-language' );
var request = require( 'request-enhanced' );
var yargs = require('yargs');
var exec = require('child_process').exec;

/************************************/
/* COMMAND LINE PARSING *************/
/************************************/

var argv = yargs.usage('Mirror many mediawikis instances base on the matrix extension: $0'
	   + '\nExample: node mwmatrixoffliner.js --mwUrl=http://meta.wikimedia.org/ --parsoidUrl=http://parsoid-lb.eqiad.wikimedia.org/ [--project=wikivoyage] [--language=fr]')
    .require([ 'mwUrl', 'parsoidUrl' ])
    .options( ['project', 'language', 'tmpDirectory', 'outputDirectory'] )
    .describe( 'project', 'Projects to dump')
    .describe( 'language', 'Language to dump')
    .describe( 'mwURL', 'Mediawiki API URL')
    .describe( 'parsoidUrl', 'Mediawiki Parsoid URL')
    .describe( 'tmpDirectory', 'Directory where files are temporary stored')
    .describe( 'outputDirectory', 'Directory to write the ZIM files')
    .strict()
    .argv;

/************************************/
/* CUSTOM VARIABLE SECTION **********/
/************************************/

var outputDirectory = argv.outputDirectory ? homeDirExpander( argv.outputDirectory ) + '/' : 'zim/';
var tmpDirectory = argv.tmpDirectory ? homeDirExpander( argv.tmpDirectory ) + '/' : 'static/';
var parsoidUrl = argv.parsoidUrl[ argv.parsoidUrl.length - 1 ] == '/' ? argv.parsoidUrl : argv.parsoidUrl + '/';
var mwUrl = argv.mwUrl[ argv.mwUrl.length - 1 ] == '/' ? argv.mwUrl : argv.mwUrl + '/';
var webUrl = mwUrl + 'wiki/';
var apiUrl = mwUrl + 'w/api.php?';
var matrixUrl = apiUrl + 'action=sitematrix&format=json';
var mediawikis = new Array();
var project = argv.project;
var language = argv.language;

/************************************/
/* MAIN *****************************/
/************************************/

async.series(
    [
	function( finished ) { init( finished ) },
	function( finished ) { loadMatrix( finished ) },
	function( finished ) { dump( finished ) }
    ],
    function( error ) {
	if ( error ) {
	    console.error( 'Unable to dump correctly all mediawikis (' + error + ')' );
	} else {
	    console.log( 'All mediawikis dump successfuly' );
	}
    }
);

/************************************/
/* FUNCTIONS ************************/
/************************************/

function init( finished ) {
    async.series(
	[
	    function( finished ) {
		fs.mkdir( outputDirectory, undefined, function() {
		    fs.exists( outputDirectory, function ( exists ) {
			if ( exists && fs.lstatSync( outputDirectory ).isDirectory() ) {
			    finished();
			} else {
			    finished( 'Unable to create directory \'' + outputDirectory + '\'' );
			}
		    });
		});
	    },
	    function( finished ) {
		fs.mkdir( tmpDirectory, undefined, function() {
		    fs.exists( tmpDirectory, function ( exists ) {
			if ( exists && fs.lstatSync( tmpDirectory ).isDirectory() ) {
			    finished();
			} else {
			    finished( 'Unable to create directory \'' + tmpDirectory + '\'' );
			}
		    });
		});
	    },
	],
	function( error ) {
	    if ( error ) {
		console.error( error );
		process.exit( 1  );
	    } else {
		finished();
	    }
	}
    );
}

function dump( finished ) {
    async.eachSeries(
	mediawikis,
	function ( site, finished ) {
	    if ( ( !project || site.code == project ) && 
		 ( !language || site.lang == language ) ) {
		var localMwUrl = site.url + '/';
		var localParsoidUrl = parsoidUrl + site.dbname + '/';
		var localTmpDirectory = tmpDirectory + site.dbname + '/';
		var localLog = tmpDirectory + site.dbname + '.log';
		var cmd = 'node mwoffliner.js --mwUrl="' + localMwUrl + '" --parsoidUrl="' + localParsoidUrl 
		    + '" --format= --format=nopic --outputDirectory="' + localTmpDirectory + '" > "' + localLog + '"';
		console.log( 'Dumping ' + site.url + ' (' + cmd + ')' );
		exec( cmd, function( executionError, stdout, stderr ) {
		    if ( executionError ) {
			finished( executionError );
		    } else {
			cmd = 'mv ' + localTmpDirectory + '*.zim "' + outputDirectory + '"'; 
			console.log( 'Moving ZIM files (' + cmd + ')' );
			exec( cmd, function( executionError, stdout, stderr ) {
			    if ( executionError ) {
				finished( executionError );
			    } else {
				finished();
			    }
			});
		    }
		});
	    } else {
		finished()
	    }
	},
	function( error ) {
	    finished( error );
	}
    )
}

function loadMatrix( finished ) {
    loadUrlAsync( matrixUrl, function( json ) {
	if ( !JSON.parse( json )['error'] ) {
	    var entries = JSON.parse( json );
	    var entryCount = entries['sitematrix']['count'];
	    for ( var i=0; i<entryCount; i++ ) {
		var entry = entries['sitematrix'][i];
		if ( entry ) {
		    var language = entry['code'];
		    var sites = entry['site'];
		    for ( var j=0; j<sites.length; j++) {
			sites[ j ].lang = language;
			mediawikis.push( sites[ j ] );
		    }
		}
	    }
	    console.log( 'Matrix loaded successfuly' );
	    finished();
	} else {
	    console.error( 'Unable to parse the matrix JSON from ' + matrixUrl );
	    process.exit( 1 );
	}
    });
}

function loadUrlAsync( url, callback, var1, var2, var3 ) {
    async.retry(
	5,
	function( finished ) {
	    request.get( {url: url, timeout: 200000} , function( error, body ) {
		if ( error ) {
		    setTimeout( function() {
			finished( 'Unable to async retrieve ' + decodeURI( url ) + ' ( ' + error + ' )');
		    }, 50000 );
		} else {
		    finished( undefined, body );
		}
	    });
	},
	function ( error, data ) {
	    if ( error ) {
		console.error( error );
	    }
	    if ( callback ) {
		callback( data, var1, var2, var3 );
	    } 		    
	});
}
