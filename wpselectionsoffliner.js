#!/usr/bin/env node
"use strict";

/************************************/
/* MODULE VARIABLE SECTION **********/
/************************************/

var fs = require( 'fs' );
var async = require( 'async' );
var http = require( 'follow-redirects' ).http;
var https = require( 'follow-redirects').https;
var pathParser = require( 'path' );
var homeDirExpander = require( 'expand-home-dir' );
var countryLanguage = require( 'country-language' );
var yargs = require( 'yargs' );
var exec = require( 'child_process' ).exec;
var spawn = require( 'child_process' ).spawn;

/************************************/
/* COMMAND LINE PARSING *************/
/************************************/

var argv = yargs.usage('Given a directory, create for each selection list file belonging to it, the corresponding ZIM file against Wikipedia: $0'
	   + '\nExample: ./wpselectionsoffliner.js --directory=/tmp/wikiproject/ [--tmpDirectory=/tmp/] --outputDirectory=[/var/zim2index]' )
    .require( [ 'directory' ] )
    .describe( 'tmpDirectory', 'Directory where files are temporary stored')
    .describe( 'outputDirectory', 'Directory to write the ZIM files')
    .describe( 'verbose', 'Print debug information to the stdout' )
    .describe( 'resume', 'Do not overwrite if ZIM file already created' )
    .strict()
    .argv;

/* Check if opt. binaries are available */
var optBinaries = [ 'mv --version' ];
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

var date = new Date();
var directory = getAbsoluteDirectoryPath( homeDirExpander( argv.directory ) );
var outputDirectory = getAbsoluteDirectoryPath( argv.outputDirectory ? homeDirExpander( argv.outputDirectory ) + '/' : directory );
var tmpDirectory = argv.tmpDirectory;
var verbose = argv.verbose;
var resume = argv.resume;
var selections = new Array();
var wpBlackList = [];
var mediawikis = new Object();

/************************************/
/* MAIN *****************************/
/************************************/

async.series(
    [
	function( finished ) { init( finished ) },
	function( finished ) { loadMatrix( finished ) },
	function( finished ) { loadSelections( finished ) },
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
	selections,
	function ( language, finished ) {
	    if ( wpBlackList.indexOf( language ) == -1 ) {
		var mwUrl = 'http://' + language + '.wikipedia.org/';
		var articleList = directory + language;
		var parsoidCode = mediawikis[ language ] && mediawikis[ language ].dbname ? mediawikis[ language ].dbname : undefined;
		if ( !parsoidCode ) {
		    console.error( 'Unable to compute parsoid URL for :' + mwUrl );
		    process.exit( 1 );
		}
		var parsoidUrl = 'http://parsoid-lb.eqiad.wikimedia.org/' + parsoidCode + '/';

		printLog( 'Dumping selection for language "' + language + '"' );
		executeTransparently( './mwoffliner.js',
				      [ '--mwUrl=' + mwUrl, '--parsoidUrl=' + parsoidUrl,
					'--outputDirectory=' + outputDirectory,
					'--articleList=' + articleList, 
					'--filenamePrefix=' + zimFilenamePrefix,
					tmpDirectory ? '--tmpDirectory=' + tmpDirectory : ' ',
					resume ? '--resume' : ' ',
					verbose ? '--verbose' : ' ',
				      ],
				      function( executionError ) {
					  if ( executionError ) {
					      console.error( executionError );
					      process.exit( 1 );
					  } else {
					      finished();
					  }
				      });
	    } else {
		printLog( language + '.wikipedia.org is blacklisted, dumping of this Wikipedia will be skiped' );
		finished();
	    }
	},
	function( error ) {
	    finished( error );
	});
}

function loadSelections( finished ) {
    fs.readdir( directory, function( error, list ) {
	selections = list;
	setTimeout( finished, 0 );
    });
}

function executeTransparently( command, args, callback, nostdout, nostderr ) {
    printLog( 'Executing command: ' + command + ' ' + args.join( ' ' ) ); 

    try {
        var proc = spawn( command, args );

	if ( !nostdout ) {
            proc.stdout.on( 'data', function ( data ) {
		printLog( String( data ).replace(/[\n\r]/g, '') );
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
	console.info( msg );
    }
}

function loadMatrix( finished ) {
    downloadContent( 'http://meta.wikimedia.org/w/api.php?action=sitematrix&format=json', function( json ) {
	if ( !JSON.parse( json )['error'] ) {
	    var entries = JSON.parse( json );
	    var entryCount = entries['sitematrix']['count'];
	    for ( var i=0; i<entryCount; i++ ) {
		var entry = entries['sitematrix'][i];
		if ( entry ) {
		    var language = entry['code'];
		    var sites = entry['site'];
		    for ( var j=0; j<sites.length; j++) {
			if ( sites[ j ].code == 'wiki' && sites[ j ].closed === undefined ) {
			    mediawikis[ language ] = sites[ j ];
			}
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

function getAbsoluteDirectoryPath( directoryPath ) {
    return directoryPath[0] === '/' ? directoryPath : pathParser.resolve( process.cwd(), directoryPath ) + '/';
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