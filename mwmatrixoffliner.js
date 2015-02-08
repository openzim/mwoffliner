#!/usr/bin/env node
"use strict";

/************************************/
/* MODULE VARIABLE SECTION **********/
/************************************/

var fs = require( 'fs' );
var async = require( 'async' );
var http = require('follow-redirects').http;
var https = require('follow-redirects').https;
var urlParser = require( 'url' );
var pathParser = require( 'path' );
var homeDirExpander = require( 'expand-home-dir' );
var countryLanguage = require( 'country-language' );
var yargs = require('yargs');
var exec = require('child_process').exec;
var spawn = require('child_process').spawn;

/************************************/
/* COMMAND LINE PARSING *************/
/************************************/

var argv = yargs.usage('Mirror many mediawikis instances base on the matrix extension: $0'
	   + '\nExample: node mwmatrixoffliner.js --mwUrl=http://meta.wikimedia.org/ --parsoidUrl=http://parsoid-lb.eqiad.wikimedia.org/ --adminEmail=foo@bar.net [--project=wikivoyage] [--language=fr]')
    .require([ 'mwUrl', 'parsoidUrl', 'adminEmail' ])
    .options( ['project', 'language', 'tmpDirectory', 'outputDirectory', 'resume', 'languageInverter', 'projectInverter', 'speed'] )
    .describe( 'adminEmail', 'Email of the mwoffliner user which will be put in the HTTP user-agent string' )
    .describe( 'language', 'Language to dump (regex)')
    .describe( 'languageInverter', 'If given, select languages *not* matching the --language regex')
    .describe( 'mwURL', 'Mediawiki API URL')
    .describe( 'outputDirectory', 'Directory to write the ZIM files')
    .describe( 'parsoidUrl', 'Mediawiki Parsoid URL')
    .describe( 'project', 'Projects to dump')
    .describe( 'projectInverter', 'If given, select projects *not* matching the --project regex')
    .describe( 'resume', 'Do not overwrite if ZIM file already created' )
    .describe( 'speed', 'Multiplicator for the number of parallel HTTP requests on Parsoid backend (per default the number of CPU cores). The default value is 1.' )
    .describe( 'tmpDirectory', 'Directory where files are temporary stored')
    .describe( 'verbose', 'Print debug information to the stdout' )
    .strict()
    .argv;

/* Check if opt. binaries are available */
var optBinaries = [ 'xz --version', 'mv --version' ];
optBinaries.forEach( function( cmd ) {
    exec(cmd + ' 2>&1 > /dev/null', function( error, stdout, stderr ) {
	if ( error ) {
	    console.error( 'Failed to find binary "' + cmd.split(' ')[0] + '": (' + error + ')' );
	    process.exit( 1 );
	}
    });
});

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
var projectRegexp = new RegExp( '^' + ( argv.project || '.*' ) + '$' );
var projectInverter = argv.projectInverter || argv.projectInverter;
var languageRegexp = new RegExp( '^' + ( argv.language || '.*' ) + '$' );
var languageInverter = argv.projectInverter || argv.languageInverter;
var verbose = argv.verbose;
var adminEmail = argv.adminEmail;
var resume = argv.resume;
var speed = argv.speed;

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
	    printLog( 'All mediawikis dump successfuly' );
	}
    }
);

/************************************/
/* FUNCTIONS ************************/
/************************************/

function init( finished ) {
    finished();
}

function dump( finished ) {
    async.eachSeries(
	mediawikis,
	function ( site, finished ) {
	    if ( ( !projectInverter && projectRegexp.test( site.code ) || ( projectInverter && !projectRegexp.test( site.code ) ) ) &&
		 ( !languageInverter && languageRegexp.test( site.lang ) || ( languageInverter && !languageRegexp.test( site.lang ) ) ) ) {
		     var localMwUrl = site.url + '/';
		     var localParsoidUrl = parsoidUrl + site.dbname + '/';
		     printLog( 'Dumping ' + site.url );
		executeTransparently( 'node',
				      [ './mwoffliner.js', '--mwUrl=' + localMwUrl, '--parsoidUrl=' + localParsoidUrl, '--adminEmail=' + adminEmail,
					'--format=', '--format=nopic', '--outputDirectory=' + outputDirectory, verbose ? '--verbose' : ' ', resume ? '--resume' : ' ', speed ? '--speed=' + speed : ' ' ],
				      function( executionError ) {
					  if ( executionError ) {
					      console.error( executionError );
					      process.exit( 1 );
					  } else {
					      finished();
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
    downloadContent( matrixUrl, function( json ) {
	if ( !JSON.parse( json )['error'] ) {
	    var entries = JSON.parse( json );
	    var entryCount = entries['sitematrix']['count'];
	    for ( var i=0; i<entryCount; i++ ) {
		var entry = entries['sitematrix'][i];
		if ( entry ) {
		    var language = entry['code'];
		    var sites = entry['site'];
		    for ( var j=0; j<sites.length; j++) {
			if (  sites[ j ].closed === undefined ) {
			    sites[ j ].lang = language;
			    mediawikis.push( sites[ j ] );
			}
		    }
		}
	    }
	    printLog( 'Matrix loaded successfuly' );
	    finished();
	} else {
	    console.error( 'Unable to parse the matrix JSON from ' + matrixUrl );
	    process.exit( 1 );
	}
    });
}

function downloadContent( url, callback, var1, var2, var3 ) {
    var retryCount = 1;

    async.retry(
	5,
	function( finished ) {
	    var calledFinished = false;
	    function callFinished( timeout, message, data ) {
		if ( !calledFinished ) {
		    calledFinished = true;
		    setTimeout( finished, timeout, message, data );
		}
	    }

	    http.get( url, function( response ) {
		if ( response.statusCode == 200 ) {
		    var data = '';

		    response.on( 'data', function ( chunk ) {
			data += chunk;
		    });
		    response.on( 'end', function() {
			callFinished( 0, null, data );
		    });
		} else {
		    var message = 'Unable to donwload content [' + retryCount + '] ' + decodeURI( url ) + ' (statusCode=' + response.statusCode + ').';
		    console.error( message );
		    callFinished( 0, message );
		}
	    })
	    .on( 'error', function( error ) {
                var message = 'Unable to download content [' + retryCount + '] ' + decodeURI( url ) + ' ( ' + error + ' ).';
                console.error( message );
		callFinished( 0, message );
	    })
	    .on( 'socket', function ( socket ) {
		var req = this;
		socket.setTimeout( 50000 * ++retryCount ); 
		if ( !socket.custom ) {
		    socket.custom = true;
		    socket.addListener( 'timeout', function() {
			var message = 'Unable to download content [' + retryCount + '] ' + decodeURI( url ) + ' (socket timeout)';
			console.error( message );
			callFinished( 2000, message );
		    }); 
		    socket.addListener( 'error', function( error ) {
			var message = 'Unable to download content [' + retryCount + '] ' + decodeURI( url ) + ' (socket error)';
			console.error( message );
			callFinished( 2000, message );
		    });
		}
	    });
	},
	function ( error, data ) {
	    if ( error ) {
		console.error( "Absolutly unable to retrieve async. URL. " + error );
	    }
	    if ( callback ) {
		setTimeout( callback, 0, data, var1, var2, var3 );
	    } 		    
	});
}

function executeTransparently( command, args, callback, nostdout, nostderr ) {
    printLog( 'Executing command: ' + command + ' ' + args.join( ' ' ) ); 

    try {
        var proc = spawn( command, args );

	if ( !nostdout ) {
            proc.stdout.on( 'data', function ( data ) {
		console.log( String( data ).replace(/[\n\r]/g, '') );
            });
	}

        if ( !nostderr ) {
            proc.stderr.on( 'data', function ( data ) {
		console.error( String( data ).replace(/[\n\r]/g, '') );
            });
	}

        proc.on( 'close', function ( code ) {
            callback( code !== 0 ? 'Error by executing ' + command : undefined );
	});
    } catch ( error ) {
	callback( 'Error by executing ' + command );
    }
}

function printLog( msg ) {
    if ( verbose ) {
	console.log( msg );
    }
}