#!/usr/bin/env node
"use strict";

/************************************/
/* MODULE VARIABLE SECTION **********/
/************************************/

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
	   + '\nExample: node mwmatrixoffliner.js --mwUrl=http://en.wikipedia.org/ --parsoidUrl=http://parsoid-lb.eqiad.wikimedia.org/enwiki/ [--projects=wikivoyage] [--languages=en,fr /var/zim/]')
    .require([ 'mwUrl', 'parsoidUrl' ])
    .options( ['projects', 'languages', 'tmpDirectory', 'outputDirectory'] )
    .describe( 'projects', 'List of projects to dump')
    .describe( 'language', 'List of language to dump')
    .describe( 'mwURL', 'Mediawiki API URL')
    .describe( 'parsoidURL', 'Mediawiki Parsoid URL')
    .describe( 'tmpDirectory', 'Directory where files are temporary stored')
    .describe( 'outputDirectory', 'Directory to write the ZIM files')
    .strict()
    .argv;

/************************************/
/* CUSTOM VARIABLE SECTION **********/
/************************************/

var outputDirectory = argv.outputDirectory ? homeDirExpander( argv.outputDirectory ) + '/' : 'static/';
var parsoidUrl = argv.parsoidUrl;
var mwUrl = argv.mwUrl;
var webUrl = mwUrl + 'wiki/';
var apiUrl = mwUrl + 'w/api.php?';
var matrixUrl = apiUrl + 'action=sitematrix&format=json';
var mediawikis = new Array();

/************************************/
/* MAIN *****************************/
/************************************/

async.series(
    [
	function( finished ) { loadMatrix( finished ) },
	function( finished ) { dump( finished ) }
    ],
    function( error ) {
	console.log( 'All mediawikis dumps successfuly' );
    }
);

/************************************/
/* FUNCTIONS ************************/
/************************************/

function dump( finished ) {
    var cmd = 'cat /tmp';

    exec( cmd, function( executionError, stdout, stderr ) {
	finished();
    });    
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
