#!/usr/bin/env node
"use strict";

/************************************/
/* MODULE VARIABLE SECTION **********/
/************************************/

var fs = require( 'fs' );
var async = require( 'async' );
var pathParser = require( 'path' );
var homeDirExpander = require( 'expand-home-dir' );
var countryLanguage = require( 'country-language' );
var yargs = require('yargs');
var exec = require('child_process').exec;
var spawn = require('child_process').spawn;

/************************************/
/* COMMAND LINE PARSING *************/
/************************************/

var argv = yargs.usage('Given a directory, create for each selection list file belonging to it, the corresponding ZIM file against Wikipedia: $0'
	   + '\nExample: node wpselectionsoffliner.js --directory=/tmp/wikiproject/ [--tmpDirectory=/tmp/] --outputDirectory=[/var/zim2index]')
    .require([ 'directory' ])
    .options( ['verbose', 'tmpDirectory', 'outputDirectory', 'resume'] )
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
var tmpDirectory = getAbsoluteDirectoryPath( argv.tmpDirectory ? homeDirExpander( argv.tmpDirectory ) + '/' : 'static/' );
var verbose = argv.verbose;
var resume = argv.resume;
var selections = new Array();
var wpBlackList = [ 'be-x-old' ];

/************************************/
/* MAIN *****************************/
/************************************/

async.series(
    [
	function( finished ) { init( finished ) },
	function( finished ) { loadSelections( finished ) },
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
	selections,
	function ( language, finished ) {
	    if ( wpBlackList.indexOf( language ) == -1 ) {
		var parsoidUrl = 'http://parsoid-lb.eqiad.wikimedia.org/' + language + 'wiki/';
		var mwUrl = 'http://' + language + '.wikipedia.org/';
		var articleList = directory + language;
		var selectionName = pathParser.basename( directory );
		var zimFilenamePrefix = 'wikipedia_' + language + '_' + selectionName;
		var zimFullPath = outputDirectory + zimFilenamePrefix + '_' + date.getFullYear() + '-' + ( '0' + ( date.getMonth() ) ).slice( -2 ) + '.zim';
		
		console.log( zimFullPath );

		if ( resume && fs.existsSync( zimFullPath ) ) {
		    printLog( 'Dumping selection for language "' + language + '" already done. ZIM file available at ' + zimFullPath );
		    finished();
		} else {
		    printLog( 'Dumping selection for language "' + language + '"' );
		    executeTransparently( 'node',
					  [ './mwoffliner.js', '--mwUrl=' + mwUrl, '--parsoidUrl=' + parsoidUrl,
					    '--outputDirectory=' + tmpDirectory, verbose ? '--verbose' : '',
					    '--articleList=' + articleList, 
					    '--filenamePrefix=' + zimFilenamePrefix
					  ],
					  function( executionError ) {
					      if ( executionError ) {
						  console.error( executionError );
						  process.exit( 1 );
					      } else {
						  var cmd = 'mv ' + tmpDirectory + '*.zim "' + outputDirectory + '"'; 
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
		}
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
    console.log( 'Executing command: ' + command + ' ' + args.join( ' ' ) ); 

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
	console.info( msg );
    }
}

function getAbsoluteDirectoryPath( directoryPath ) {
    return directoryPath[0] === '/' ? directoryPath : pathParser.resolve( process.cwd(), directoryPath ) + '/';
}