#!/bin/sh
":" //# -*- mode: js -*-; exec /usr/bin/env node --max-old-space-size=9000 --stack-size=42000 "$0" "$@"

"use strict";

/************************************/
/* MODULE VARIABLE SECTION **********/
/************************************/

var fs = require( 'fs' );
var domino = require( 'domino' );
var jsdom = require( 'jsdom' );
var async = require( 'async' );
var http = require( 'follow-redirects' ).http;
var https = require( 'follow-redirects' ).https;
var zlib = require( 'zlib' );
var swig = require( 'swig' );
var urlParser = require( 'url' );
var pathParser = require( 'path' );
var homeDirExpander = require( 'expand-home-dir' );
var mkdirp = require( 'mkdirp' );
var countryLanguage = require( 'country-language' );
var redis = require( 'redis' );
var childProcess = require( 'child_process' );
var exec = require( 'child_process' ).exec;
var spawn = require( 'child_process' ).spawn;
var yargs = require( 'yargs' );
var os = require( 'os' );
var crypto = require( 'crypto' );
var unicodeCutter = require( 'utf8-binary-cutter' );
var htmlMinifier = require('html-minifier');

/************************************/
/* Command Parsing ******************/
/************************************/

var argv = yargs.usage( 'Create a fancy HTML dump of a Mediawiki instance in a directory\nUsage: $0'
	   + '\nExample: node mwoffliner.js --mwUrl=http://en.wikipedia.org/ --parsoidUrl=http://rest.wikimedia.org/en.wikipedia.org/v1/page/html/ --adminEmail=foo@bar.net' )
    .require( ['mwUrl', 'parsoidUrl', 'adminEmail' ] )
    .describe( 'adminEmail', 'Email of the mwoffliner user which will be put in the HTTP user-agent string' )
    .describe( 'articleList', 'File with one title (in UTF8) per line' )
    .describe( 'cacheDirectory', 'Directory where files are permanently cached' )
    .describe( 'customZimFavicon', 'Use this option to give a path to a PNG favicon, it will be used in place of the Mediawiki logo.' )
    .describe( 'deflateTmpHtml', 'To reduce I/O, HTML pages might be deflated in tmpDirectory.' )
    .describe( 'filenamePrefix', 'For the part of the ZIM filename which is before the date part.' )
    .describe( 'format', 'To custom the output with comma separated values : "nopic,nozim"' )
    .describe( 'keepEmptyParagraphs', 'Keep all paragraphs, even empty ones.' )
    .describe( 'keepHtml', 'If ZIM built, keep the temporary HTML directory' )
    .describe( 'mwURL', 'Mediawiki base URL' )
    .describe( 'mwWikiPath', 'Mediawiki wiki base path (per default "/wiki/"' )
    .describe( 'mwApiPath',  'Mediawiki API path (per default "/w/api.php"' )
    .describe( 'minifyHtml', 'Try to reduce the size of the HTML' )
    .describe( 'outputDirectory', 'Directory to write the downloaded content' )
    .describe( 'parsoidURL', 'Mediawiki Parsoid URL' )
    .describe( 'redisSocket', 'Path to Redis socket file' )
    .describe( 'requestTimeout', 'Request timeout (in seconds)' )
    .describe( 'resume', 'Do not overwrite if ZIM file already created' )
    .describe( 'skipHtmlCache', 'Do not cache Parsoid HTML output (and do not use any cached HTML content)' )
    .describe( 'speed', 'Multiplicator for the number of parallel HTTP requests on Parsoid backend (per default the number of CPU cores). The default value is 1.' )
    .describe( 'tmpDirectory', 'Directory where files are temporary stored' )
    .describe( 'verbose', 'Print debug information to the stdout' )
    .strict()
    .argv;

/************************************/
/* CUSTOM VARIABLE SECTION **********/
/************************************/

/* Formats */
var dumps = [ '' ];
if ( argv.format ) {
    if ( argv.format instanceof Array ) {
	dumps = new Array();
	argv.format.forEach( function( value ) {
	    dumps.push( value == true ? '' : value );
	});
    } else if ( argv.format != true ) {
	dumps = [ argv.format ];
    }
}

/* Template code for any redirect to be written on the FS */
var redirectTemplateCode = '<html><head><meta charset="UTF-8" /><title>{{ title }}</title><meta http-equiv="refresh" content="0; URL={{ target }}"></head><body></body></html>';

/* All DOM nodes with on of these styles will be removed */
/* On Wikivoyage 'noprint' remove also top banners like on 'South America'. */
var cssClassBlackList = [ 'noprint', 'metadata', 'ambox', 'stub', 'topicon', 'magnify', 'navbar' ]; 

/* All DOM node with these styles will be deleted if no A node is included in the sub-tree */
var cssClassBlackListIfNoLink = [ 'mainarticle', 'seealso', 'dablink', 'rellink', 'hatnote' ];

/* List of style to be removed */
var cssClassCallsBlackList = [ 'plainlinks' ];

/* All nodes with one of these ids will be remove */
var idBlackList = [ 'purgelink' ];

/* HTTP user-agent string */
var adminEmail = argv.adminEmail;
var userAgentString = 'MWOffliner/HEAD';
if ( validateEmail( adminEmail ) ) {
    userAgentString += ' (' + adminEmail + ')';
} else {
    console.error( 'Admin email ' + adminEmail + ' is not valid' );
    process.exit( 1 );
}

/* Directory wehre everything is saved at the end of the process */
var outputDirectory = argv.outputDirectory ? homeDirExpander( argv.outputDirectory ) + '/' : 'out/';

/* Directory where temporary data are saved */
var tmpDirectory = argv.tmpDirectory ? homeDirExpander( argv.tmpDirectory ) + '/' : 'tmp/';
var deflateTmpHtml = argv.deflateTmpHtml;

/* Parsoid URL */
var parsoidUrl = argv.parsoidUrl;

/* ZIM custom Favicon */
var customZimFavicon = argv.customZimFavicon;
if ( customZimFavicon && !fs.existsSync( customZimFavicon ) ) {
    console.error( 'Path "' + customZimFavicon + '" is not a valid PNG file.' );
    process.exit( 1 );    
}

/* If ZIM is built, should temporary HTML directory be kept */
var keepHtml = argv.keepHtml;

/* List of articles is maybe in a file */
var articleList = argv.articleList;

/* Prefix part of the filename (radical) */
var filenamePrefix = argv.filenamePrefix || '';

/* Number of parallel requests */
var cpuCount = os.cpus().length;
if ( argv.speed && isNaN( argv.speed ) ) {
    console.error( 'speed is not a number, please give a number value to --speed' );
    process.exit( 1 );
}
var speed = cpuCount * ( argv.speed || 1 );

/* Necessary to avoid problems with https */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

/* Verbose */
var verbose = argv.verbose;

/* Optimize HTML */
var minifyHtml = argv.minifyHtml;

/* Cache strategy */
var skipHtmlCache = argv.skipHtmlCache;

/* Should we keep ZIM file generation if ZIM file already exists */
var resume = argv.resume;

/* Path to a Redis socket */
var redisSocket = argv.redisSocket ? argv.redisSocket : '/dev/shm/redis.sock';

/* Default request timeout */
var requestTimeout = argv.requestTimeout ? argv.requestTimeout : 60;

/* Keep empty paragraphs */
var keepEmptyParagraphs = argv.keepEmptyParagraphs;

/* ZIM publisher */
var publisher = 'Kiwix';

/* Wikipedia/... URL */
var mwUrl = argv.mwUrl;
var hostParts = urlParser.parse( mwUrl ).hostname.split( '.' );

/* ZIM (content) creator */
var creator = hostParts[0];
if ( hostParts.length > 1 ) {
    creator = hostParts[0].length > hostParts[1].length ? hostParts[0] : hostParts[1];
}
creator = creator.charAt( 0 ).toUpperCase() + creator.substr( 1 );

/* Namespaces to mirror */
var namespacesToMirror = new Array();

/* License footer template code */
var footerTemplateCode = '<div style="clear:both; background-image:linear-gradient(180deg, #E8E8E8, white); border-top: dashed 2px #AAAAAA; padding: 0.5em 0.5em 2em 0.5em; margin-top: 1em; direction: ltr;">This article is issued from <a class="external text" href="{{ webUrl }}{{ articleId }}?oldid={{ oldId }}">{{ name }}</a>{% if date %} - version of the {{ date }}{% endif %}. The text is available under the <a class="external text" href="http://creativecommons.org/licenses/by-sa/3.0/">Creative Commons Attribution/Share Alike</a> but additional terms may apply for the media files.</div>';

/************************************/
/* CONSTANT VARIABLE SECTION ********/
/************************************/

var styleDirectory = 's';
var mediaDirectory = 'm';
var javascriptDirectory = 'j';
var mediaRegex = /^(.*\/)([^\/]+)(\/)(\d+px-|)(.+?)(\.[A-Za-z0-9]{2,6})(\.[A-Za-z0-9]{2,6}|)$/;
var htmlTemplateCode = function(){/*
<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <title></title>
    <link rel="stylesheet" href="s/style.css" />
    <script src="j/head.js"></script>
  </head>
  <body class="mw-body mw-body-content mediawiki" style="background-color: white; margin: 1em 0.5em 0 0; border-width: 0px; padding: 0px;">
    <div id="content" class="mw-body" style="margin: 0 1em; border-width: 0px;">
      <a id="top"></a>
      <h1 id="titleHeading" style="background-color: white;"></h1>
      <div id="mw-content-text" style="padding-top: 1em;">
      </div>
    </div>
    <script src="j/body.js"></script>
  </body>
</html>
*/}.toString().slice(14,-3);

/************************************/
/* SYSTEM VARIABLE SECTION **********/
/************************************/

var INFINITY_WIDTH = 9999999;
var ltr = true;
var autoAlign = ltr ? 'left' : 'right';
var revAutoAlign = ltr ? 'right' : 'left';
var subTitle = 'From Wikipedia, the free encyclopedia';
var name = '';
var langIso2 = 'en';
var langIso3 = 'eng';
var articleIds = {};
var namespaces = {};
var mwWikiPath = argv.mwWikiPath ? argv.mwWikiPath : 'wiki';
var webUrl = mwUrl + mwWikiPath + '/';
var webUrlHost =  urlParser.parse( webUrl ).host;
var webUrlPath = urlParser.parse( webUrl ).pathname;
var mwApiPath = argv.mwApiPath ? argv.mwApiPath : 'w/api.php';
var apiUrl = mwUrl + ( argv.mwApiPath ? argv.mwApiPath : 'w/api.php' ) + '?';
var nopic = false;
var nozim = false;
var filenameRadical = '';
var htmlRootPath = '';
var cacheDirectory = '';
var cacheDirectory = ( argv.cacheDirectory ? argv.cacheDirectory : pathParser.resolve( process.cwd(), 'cac' ) ) + '/';

/************************************/
/* RUNNING CODE *********************/
/************************************/

/* Check if opt. binaries are available */
var optBinaries = [ 'jpegoptim --version', 'pngquant --version', 'gifsicle --version', 'advdef --version', 'file --help', 'stat --version', 'convert --version' ];
try {
    dumps.forEach( function( dump ) {
	if ( dump.toLowerCase().indexOf( 'nozim' ) < 0 ) {
	    optBinaries.push( 'zimwriterfs --help' );
	    throw BreakException;
	}
    });
} catch(e) {
}
optBinaries.forEach( function( cmd ) {
    exec( cmd + ' 2>&1 > /dev/null', function( error, stdout, stderr ) {
	if ( error ) {
	    console.error( 'Failed to find binary "' + cmd.split( ' ' )[0] + '": (' + error + ')' );
	    process.exit( 1 );
	}
    }, true, true);
});

/* Setup redis client */
var redisClient = redis.createClient( redisSocket );
var redisRedirectsDatabase = Math.floor( ( Math.random() * 10000000 ) + 1 ) + 'redirects';
var redisMediaIdsDatabase = Math.floor( ( Math.random() * 10000000 ) + 1 ) + 'mediaIds';
var redisArticleDetailsDatabase = Math.floor( ( Math.random() * 10000000 ) + 1 ) + 'articleDetails';
var redisCachedMediaToCheckDatabase = Math.floor( ( Math.random() * 10000000 ) + 1 ) + 'cachedMediaToCheck';
redisClient.expire( redisRedirectsDatabase, 60 * 60 *24 * 30, function( error, result) {} );
redisClient.expire( redisMediaIdsDatabase, 60 * 60 *24 * 30, function( error, result) {} );
redisClient.expire( redisArticleDetailsDatabase, 60 * 60 *24 * 30, function( error, result) {} );

/* Compile templates */
var redirectTemplate = swig.compile( redirectTemplateCode );
var footerTemplate = swig.compile( footerTemplateCode );

/* Get content */
async.series(
    [
	function( finished ) { getTextDirection( finished ) },
	function( finished ) { getSubTitle( finished ) },
	function( finished ) { getSiteInfo( finished ) },
	function( finished ) { getNamespaces( finished ) },
	function( finished ) { createDirectories( finished ) },
	function( finished ) { prepareCache( finished ) },
	function( finished ) { checkResume( finished ) },
	function( finished ) { getArticleIds( finished ) },
	function( finished ) { 
	    async.eachSeries(
		dumps,
		function( dump, finished ) {
		    printLog( 'Starting a new dump...' );
		    nopic = dump.toString().search( 'nopic' ) >= 0 ? true : false;
		    nozim = dump.toString().search( 'nozim' ) >= 0 ? true : false;
		    keepHtml = nozim ? true : keepHtml;
		    filenameRadical = computeFilenameRadical();
		    htmlRootPath = computeHtmlRootPath();

		    async.series(
			[
			    function( finished ) { createSubDirectories( finished ) },
			    function( finished ) { saveJavascript( finished ) }, 
			    function( finished ) { saveStylesheet( finished ) },
			    function( finished ) { saveFavicon( finished ) },
			    function( finished ) { getMainPage( finished ) },
			    function( finished ) { saveRedirects( finished ) },
			    function( finished ) { saveArticles( finished ) },
			    function( finished ) { drainDownloadFileQueue( finished ) },
			    function( finished ) { drainOptimizationQueue( finished ) },
			    function( finished ) { buildZIM( finished ) },
			    function( finished ) { endProcess( finished ) }
			],
			function( error, result ) {
			    finished();
			});
		},
		function( error ) {
		    async.series(
			[
			    function( finished ) { printLog( 'Cleaning cache' ); exec( 'find "' + cacheDirectory + '" -type f -not -newer "' + cacheDirectory + 'ref" -exec rm {} \\;', finished ); },
			],
			function( error, result ) {
			    finished();
			});
		}
	    )
	}
    ],
    function( error ) {
	printLog( 'Flushing redis databases...' );
	redisClient.flushdb();
	
	printLog( 'Quitting redis databases...' );
	redisClient.quit();

	printLog( 'Closing HTTP agents' );
	closeAgents();

	printLog( 'All dumping(s) finished with success.' );
    }
);

/************************************/
/* MEDIA RELATED QUEUES *************/
/************************************/

/* Setting up media optimization queue */
var optimizationQueue = async.queue( function ( file, finished ) {
    var path = file.path;
    
    function getOptimizationCommand( path, forcedType ) {
	var ext = pathParser.extname( path ).split( '.' )[1] || '';
	var basename = path.substring( 0, path.length - ext.length - 1) || '';
	var tmpExt = '.' + randomString( 5 ) + '.' + ext;
	var tmpPath = basename + tmpExt;
	var type = forcedType || ext;
	
	/* Escape paths */
	path = path.replace( /"/g, '\\"' ).replace( /\$/g, '\\$' ).replace( /`/g, '\\`' );
	tmpPath = tmpPath.replace( /"/g, '\\"' ).replace( /\$/g, '\\$' ).replace( /`/g, '\\`' );

	if ( type === 'jpg' || type === 'jpeg' || type === 'JPG' || type === 'JPEG' ) {
	    return 'jpegoptim --strip-all -m50 "' + path + '"';
	} else if ( type === 'png' || type === 'PNG' ) {
	    return 'pngquant --verbose --nofs --force --ext="' + tmpExt + '" "' + path + 
		'" && advdef -q -z -4 -i 5 "' + tmpPath + 
		'" && if [ $(stat -c%s "' + tmpPath + '") -lt $(stat -c%s "' + path + '") ]; then mv "' + tmpPath + '" "' + path + '"; else rm "' + tmpPath + '"; fi';
	} else if ( type === 'gif' || type === 'GIF' ) {
	    return 'gifsicle --verbose -O3 "' + path + '" -o "' + tmpPath +
		'" && if [ $(stat -c%s "' + tmpPath + '") -lt $(stat -c%s "' + path + '") ]; then mv "' + tmpPath + '" "' + path + '"; else rm "' + tmpPath + '"; fi';
	}
    }

    if ( path ) {
	fs.stat( path, function ( error, stats ) {
	    if ( !error && stats.size == file.size ) {
		var cmd = getOptimizationCommand( path );
		
		if ( cmd ) {
		    async.retry( 5,
				 function( finished, skip ) {
				     exec( cmd, function( executionError, stdout, stderr ) {
					 if ( executionError ) {
					     fs.stat( path, function ( error, stats ) {
						 if ( !error && stats.size > file.size ) {
						     finished( null, true );
						 } else if ( !error && stats.size < file.size ) {
						     finished( 'File to optim is smaller (before optim) than it should.' );
						 } else {
						     exec( 'file -b --mime-type "' + path + '"', function( error, stdout, stderr ) {
							 var type = stdout.replace( /image\//, '' ).replace( /[\n\r]/g, '' );
							 cmd = getOptimizationCommand( path, type );
							 setTimeout( finished, 2000, executionError );
						     });
						 }
					     });
					 } else {
					     finished();
					 }
				     });
				 },
				 function( error, skip ) {
				     if ( error ) {
					 console.error( 'Executing command : ' + cmd );
					 console.error( 'Failed to optim ' + path + ', with size=' + file.size + ' (' + error + ')' );
				     } else if ( skip ) {
					 printLog( 'Optimization skipped for ' + path + ', with size=' + file.size + ', a better version was downloaded meanwhile.' );
				     } else {
					 printLog( 'Successfuly optimized ' + path );
				     }
				     finished();
				 }
			       );
		} else {
		    finished();
		}
	    } else  {
		console.error( 'Failed to start to optim ' + path + '. Size should be ' + file.size + 
			       ' (' + ( error ? 'file was probably deleted, here the error: ' + error : ( stats ? stats.size : 'No stats information' ) ) + ')' );
		finished();
	    }
	});
    } else {
	finished();
    }
    
}, cpuCount * 2 );

/* Setting up the downloading queue */
var downloadFileQueue = async.queue( function ( url, finished ) {
    if ( url ) {
	downloadFileAndCache( url, finished );
    } else {
	finished();
    }
}, speed * 5 );

/************************************/
/* FUNCTIONS ************************/
/************************************/

function checkResume( finished ) {
    for( var i = 0; i<dumps.length; i++ ) {
	var dump = dumps[i];
	nopic = dump.toString().search( 'nopic' ) >= 0 ? true : false;
	nozim = dump.toString().search( 'nozim' ) >= 0 ? true : false;
	htmlRootPath = computeHtmlRootPath();
	
	if ( resume && !nozim ) {
	    var zimPath = computeZimRootPath();
	    if ( fs.existsSync( zimPath ) ) {
		printLog( zimPath + ' is already done, skip dumping & ZIM file generation' );
		dumps.splice( i, 1 );
		i--;
	    }
	}
    }
    finished( dumps.length > 0 ? false : true );
}

function closeAgents( finished ) {
    http.globalAgent.destroy();
    https.globalAgent.destroy();
    if ( finished ) {
	finished();
    }
}

function prepareCache( finished ) {
    printLog( 'Preparing cache...' );
    cacheDirectory = cacheDirectory + computeFilenameRadical( true ) + '/';
    mkdirp( cacheDirectory + 'm/', function() {
        fs.writeFileSync( cacheDirectory + 'ref', '42' );
	finished();
    });
}

function createDirectories( finished ) {
    printLog( 'Creating base directories...' );
    async.series(
        [
	    function( finished ) { mkdirp( outputDirectory, finished ) },
	    function( finished ) { mkdirp( tmpDirectory, finished ) },
	],
	function( error ) {
	    if ( error ) {
		console.error( 'Unable to create mandatory directories : ' + error );
		process.exit( 1 );
	    } else {
		finished();
	    }
	});
}

function randomString( len ) {
    var randomString = '';
    var charSet = 'abcdefghijklmnopqrstuvwxyz0123456789';
    for ( var i = 0; i < len; i++ ) {
	var randomPoz = Math.floor( Math.random() * charSet.length );
	randomString += charSet.substring( randomPoz, randomPoz+1 );
    }
    return randomString;
}

function extractTargetIdFromHref( href ) {
    try {
	var pathname = urlParser.parse( href, false, true ).pathname || '';
	if ( pathname.indexOf( './' ) == 0 ) {
	    return myDecodeURIComponent( pathname.substr( 2 ) );
	} else if ( pathname.indexOf( webUrlPath ) == 0 ) {
	    return myDecodeURIComponent( pathname.substr( webUrlPath.length ) );
	}
    } catch ( error ) {
	console.error( 'Unable to parse href ' + href );
	return '';
    }
}

function computeFilenameRadical( generic ) {
    var radical;
    
    if ( filenamePrefix ) {
	radical = filenamePrefix;
    } else {
	radical = creator.charAt( 0 ).toLowerCase() + creator.substr( 1 ) + '_';
	var hostParts = urlParser.parse( webUrl ).hostname.split( '.' );
	var langSuffix = langIso2;
	for (var i=0; i<hostParts.length; i++) {
	    if ( hostParts[i] === langIso3 ) {
		langSuffix = hostParts[i];
		break;
	    }
	}
	radical += langSuffix;
    }

    if ( !generic ) {
	radical += '_';
	if ( articleList ) {
	    radical += pathParser.basename( articleList, pathParser.extname( articleList ) ) + '_';
        } else {
	    radical += 'all_';
	}
	radical += nopic ? 'nopic_' : '';

	var date = new Date();
	radical += date.getFullYear() + '-' + ( '0' + ( date.getMonth() + 1 ) ).slice( -2 );
    }
    
    return radical;
}

function computeHtmlRootPath() {
    var htmlRootPath;

    if ( nozim ) {
	htmlRootPath = outputDirectory[0] === '/' ? outputDirectory : pathParser.resolve( process.cwd(), tmpDirectory ) + '/';
    } else {
	htmlRootPath = tmpDirectory[0] === '/' ? tmpDirectory : pathParser.resolve( process.cwd(), tmpDirectory ) + '/';
    }

    htmlRootPath += computeFilenameRadical() + '/';
    return htmlRootPath;
}

function computeZimRootPath() {
    var zimRootPath = outputDirectory[0] === '/' ? outputDirectory : pathParser.resolve( process.cwd(), outputDirectory ) + '/';
    zimRootPath += computeFilenameRadical() + '.zim';
    return zimRootPath;
}

function buildZIM( finished ) {
    if ( !nozim ) {
	exec( 'sync', function( error ) {
	    var zimPath = computeZimRootPath();
	    var cmd = 'zimwriterfs --welcome=index.htm --favicon=favicon.png --language=' + langIso3
	        + ( deflateTmpHtml ? ' --inflateHtml ' : '' )
		+ ' --title="' + name + '" --description="' + ( subTitle || name ) + '" --creator="' + creator + '" --publisher="' 
		+ publisher+ '" "' + htmlRootPath + '" "' + zimPath + '"';
	    printLog( 'Building ZIM file ' + zimPath + ' (' + cmd + ')...' );
	    
	    executeTransparently( 'zimwriterfs',
				  [ deflateTmpHtml ? '--inflateHtml' : '', 
				    '--welcome=index.htm', 
				    '--favicon=favicon.png', 
				    '--language=' + langIso3, 
				    '--title=' + name,
				    '--description=' + ( subTitle || name ), 
				    '--creator=' + creator,
				    '--publisher=' + publisher, 
				    htmlRootPath, 
				    zimPath ], 
				  function( error ) {
				      if ( error ) {
					  console.error( 'Failed to build successfuly the ZIM file ' + zimPath + ' (' + error + ')' );
					  process.exit( 1 );
				      } else {
					  printLog( 'ZIM file built at ' + zimPath );
				      }
				      
				      /* Delete the html directory ? */
				      if ( keepHtml ) {
					  finished();
				      } else {
					  exec( 'rm -rf \"' + htmlRootPath + '\"', finished );
				      }
				  }, !verbose, !verbose);	
	}).on( 'error', function( error ) { console.error( error ) });
    } else {
	finished();
    }
}

function endProcess( finished ) {
    printLog( 'Dumping finished with success.' );
    finished();
}

function drainDownloadFileQueue( finished ) {
    printLog( downloadFileQueue.length() + " images still to be downloaded." );
    async.doWhilst(
	function( finished ) {
	    if ( downloadFileQueue.idle() ) {
		printLog( 'Process still downloading images...' );
	    }
	    setTimeout( finished, 1000 );
	},
	function() { return !downloadFileQueue.idle() },
	function( error ) {
	    downloadFileQueue.drain = function( error ) {
		if ( error ) {
		    console.error( 'Error by downloading images' + error );
		    process.exit( 1 );
		} else {
		    if ( downloadFileQueue.length() == 0 ) {
			printLog( 'All images successfuly downloaded' );
			downloadFileQueue.drain = undefined;
			finished();
		    }
		}
	    };
	    downloadFileQueue.push( '' );
	});
}

function drainOptimizationQueue( finished ) {
    printLog( optimizationQueue.length() + ' images still to be optimized.' );
    async.doWhilst(
	function( finished ) {
	    if ( optimizationQueue.idle() ) {
		printLog( 'Process still being optimizing images...' );
	    }
	    setTimeout( finished, 1000 );
	},
	function() { return !optimizationQueue.idle() },
	function( error ) {
	    optimizationQueue.drain = function( error ) {
		if ( error ) {
		    console.error( 'Error by optimizing images' + error );
		    process.exit( 1 );
		} else {
		    if ( optimizationQueue.length() == 0 ) {
			printLog( 'All images successfuly optimized' );
			optimizationQueue.drain = undefined;
			finished();
		    }
		}
	    };
	    optimizationQueue.push( {path: '', size: 0} );
	});
}

function saveRedirects( finished ) {
    printLog( 'Saving redirects...' );

    function saveRedirect( redirectId, finished ) {
	redisClient.hget( redisRedirectsDatabase, redirectId, function( error, target ) {
	    if ( error ) {
		console.error( 'Unable to get a redirect target from redis: ' + error );
		process.exit( 1 );
	    } else {
		if ( target ) {
		    printLog( 'Writing redirect ' + redirectId + ' (to '+ target + ')...' );
		    var html = redirectTemplate( { title: redirectId.replace( /_/g, ' ' ), 
						   target : getArticleUrl( target ) } );

		    if ( deflateTmpHtml ) {
			zlib.deflate( html, function( error, deflatedHtml ) {
			    fs.writeFile( getArticlePath( redirectId ), deflatedHtml, finished );
			});
		    } else {
			fs.writeFile( getArticlePath( redirectId ), html, finished );
		    }
		} else {
		    finished();
		}
	    }
	});
    }

    redisClient.hkeys( redisRedirectsDatabase, function ( error, keys ) {
	if ( error ) {
	    console.error( 'Unable to get redirect keys from redis: ' + error );
	    process.exit( 1 );
	} else {
	    async.eachLimit( keys, speed, saveRedirect, function( error ) {
		if ( error ) {
		    console.error( 'Unable to save a redirect: ' + error );
		    process.exit( 1 );
		} else {
		    printLog( 'All redirects were saved successfuly.' );
		    finished();
		}
	    });
	}
    });
}

function saveArticles( finished ) {

    function parseHtml( html, articleId, finished ) {
	try {
	    finished( null, domino.createDocument( html ), articleId );
	} catch ( error ) {
	    console.error( 'Crash while parsing ' + articleId );
	    console.error( error.stack );
	    process.exit( 1 );
	}
    }
    
    function treatMedias( parsoidDoc, articleId, finished ) {
	
	/* Clean/rewrite image tags */
	var imgs = parsoidDoc.getElementsByTagName( 'img' );
 	var imgSrcCache = new Object();
	
	for ( var i = 0; i < imgs.length ; i++ ) {
	    var img = imgs[i];
	    
	    if ( ( !nopic || 
		   img.getAttribute( 'typeof' ) == 'mw:Extension/math' ) && 
		 img.getAttribute( 'src' ) && 
		 img.getAttribute( 'src' ).indexOf( './Special:FilePath/' ) != 0
	       ) {
		
                /* Remove image link */
                var linkNode = img.parentNode;
                if ( linkNode.tagName === 'A' ) {
		    
		    /* Check if the target is mirrored */
		    var href = linkNode.getAttribute( 'href' ) || '';
		    var targetId = extractTargetIdFromHref( href );
		    var keepLink = targetId && isMirrored( targetId );
		    
                    /* Under certain condition it seems that this is possible
                     * to have parentNode == undefined, in this case this
                     * seems preferable to remove the whole link+content than
                     * keeping a wrong link. See for example this url
                     * http://parsoid.wmflabs.org/ko/%EC%9D%B4%ED%9C%98%EC%86%8C */
		    if ( !keepLink ) {
                        if ( linkNode.parentNode ) {
			    linkNode.parentNode.replaceChild( img, linkNode );
                        } else {
			    deleteNode( img );
                        }
		    }
                } 
		
                /* Rewrite image src attribute */
                if ( img ) {
                    var src = getFullUrl( img.getAttribute( 'src' ) );
                    var newSrc = getMediaUrl( src );
                    
                    if ( newSrc ) {
			
			/* Download image, but avoid duplicate calls */
			if ( !imgSrcCache.hasOwnProperty( src ) ) {
                            imgSrcCache[src] = true;
                            downloadFileQueue.push( src );
			}
			
			/* Change image source attribute to point to the local image */
			img.setAttribute( 'src', newSrc );
			
			/* Remove useless 'resource' attribute */
			img.removeAttribute( 'resource' );
                    } else {
			deleteNode( img );
                    }
                }
	    } else {
		deleteNode( img );
	    }
	}
	
	/* Improve image frames */
	var figures = parsoidDoc.getElementsByTagName( 'figure' );
	var spans = parsoidDoc.querySelectorAll("span[typeof=mw:Image/Frameless]");
	var imageNodes = Array.prototype.slice.call( figures ).concat( Array.prototype.slice.call( spans ) );
	for ( var i = 0; i < imageNodes.length ; i++ ) {
	    var imageNode = imageNodes[i];
	    var images = imageNode.getElementsByTagName( 'img' );
	    var image = images.length > 0 ? images[0] : undefined;
	    var isStillLinked = image && image.parentNode && image.parentNode.tagName === 'A';
	    
	    if ( !nopic && imageNode && image ) {
		var imageNodeClass = imageNode.getAttribute( 'class' ) || '';
		var imageNodeTypeof = imageNode.getAttribute( 'typeof' ) || '';
		
		if ( imageNodeTypeof.indexOf( 'mw:Image/Thumb' ) >= 0 ) {
		    var descriptions = imageNode.getElementsByTagName( 'figcaption' )
		    var description = descriptions.length > 0 ? descriptions[0] : undefined;
		    var imageWidth = parseInt( image.getAttribute( 'width' ) );
		    
		    var thumbDiv = parsoidDoc.createElement( 'div' );
		    thumbDiv.setAttribute
		    thumbDiv.setAttribute( 'class', 'thumb' );
		    if ( imageNodeClass.search( 'mw-halign-right' ) >= 0 ) {
			thumbDiv.setAttribute( 'class', concatenateToAttribute( thumbDiv.getAttribute( 'class' ), 'tright' ) );
		    } else if ( imageNodeClass.search( 'mw-halign-left' ) >= 0 ) {
			thumbDiv.setAttribute( 'class', concatenateToAttribute( thumbDiv.getAttribute( 'class' ), 'tleft' ) );
		    } else if ( imageNodeClass.search( 'mw-halign-center' ) >= 0 ) {
			thumbDiv.setAttribute( 'class', concatenateToAttribute( thumbDiv.getAttribute( 'class' ), 'tnone' ) );
			var centerDiv = parsoidDoc.createElement( 'center' );
			centerDiv.appendChild( thumbDiv );
			thumbDiv = centerDiv;
		    } else {
			thumbDiv.setAttribute( 'class', concatenateToAttribute( thumbDiv.getAttribute( 'class' ), 't' + revAutoAlign ) );
		    }
		    
		    var thumbinnerDiv = parsoidDoc.createElement( 'div' );
		    thumbinnerDiv.setAttribute( 'class', 'thumbinner' );
		    thumbinnerDiv.setAttribute( 'style', 'width:' + ( imageWidth + 2) + 'px' );
		    
		    var thumbcaptionDiv = parsoidDoc.createElement( 'div' );
		    thumbcaptionDiv.setAttribute( 'class', 'thumbcaption' );
		    thumbcaptionDiv.setAttribute( 'style', 'text-align: ' + autoAlign );
		    if ( description ) {
			thumbcaptionDiv.innerHTML = description.innerHTML
		    }
		    
		    thumbinnerDiv.appendChild( isStillLinked ? image.parentNode : image );
		    thumbinnerDiv.appendChild( thumbcaptionDiv );
		    thumbDiv.appendChild( thumbinnerDiv );
		    
		    imageNode.parentNode.replaceChild(thumbDiv, imageNode);
		} else if ( imageNodeTypeof.indexOf( 'mw:Image' ) >= 0 ) {
		    var div = parsoidDoc.createElement( 'div' );
		    if ( imageNodeClass.search( 'mw-halign-right' ) >= 0 ) {
			div.setAttribute( 'class', concatenateToAttribute( div.getAttribute( 'class' ), 'floatright' ) );
		    } else if ( imageNodeClass.search( 'mw-halign-left' ) >= 0 ) {
			div.setAttribute( 'class', concatenateToAttribute( div.getAttribute( 'class' ), 'floatleft' ) );
		    } else if ( imageNodeClass.search( 'mw-halign-center' ) >= 0 ) {
			div.setAttribute( 'class', concatenateToAttribute( div.getAttribute( 'class' ), 'center' ) );
		    }
		    div.appendChild( isStillLinked ? image.parentNode : image );
		    imageNode.parentNode.replaceChild(div, imageNode);
		}
	    } else {
		deleteNode( imageNode );
	    }
	}
	
	finished( null, parsoidDoc, articleId );
    }
    
    function rewriteUrls( parsoidDoc, articleId, finished ) {
	
	/* Go through all links */
	var as = parsoidDoc.getElementsByTagName( 'a' );
	var areas = parsoidDoc.getElementsByTagName( 'area' );
	var linkNodes = Array.prototype.slice.call( as ).concat( Array.prototype.slice.call( areas ) );
	
	function rewriteUrl( linkNode, finished ) {
	    var rel = linkNode.getAttribute( 'rel' );
	    var href = linkNode.getAttribute( 'href' ) || '';
	    
	    if ( !href ) {
		deleteNode( linkNode );
		finished();
	    } else {
		
		/* Deal with custom geo. URL replacement, for example: 
		 * http://maps.wikivoyage-ev.org/w/poimap2.php?lat=44.5044943&lon=34.1969633&zoom=15&layer=M&lang=ru&name=%D0%9C%D0%B0%D1%81%D1%81%D0%B0%D0%BD%D0%B4%D1%80%D0%B0
		 * http://tools.wmflabs.org/geohack/geohack.php?language=fr&pagename=Tour_Eiffel&params=48.85825_N_2.2945_E_type:landmark_region:fr
		 */
		if ( rel != 'mw:WikiLink' ) {
		    var lat, lon;
		    if ( /poimap2\.php/i.test(href) ) {
			var hrefQuery = urlParser.parse(href, true).query;
			lat = 0 + hrefQuery.lat;
			lon = 0 + hrefQuery.lon;
		    } else if ( /geohack\.php/i.test(href) ) {
			var params = urlParser.parse(href, true).query.params;
			if ( params ) {
			    // see https://bitbucket.org/magnusmanske/geohack/src public_html geo_param.php
			    var pieces = params.toUpperCase().split('_');
			    var semiPieces = pieces.length > 0 ? pieces[0].split(';') : undefined;
			    if ( semiPieces && semiPieces.length == 2 ) {
				lat = semiPieces[0];
				lon = semiPieces[1];
			    } else {
				var factors = [1, 60, 3600];
				var offs = 0;

				var deg = function (hemiHash) {
				    var out = 0;
				    for (var i = 0; i < 4 && (i + offs) < pieces.length; i++) {
					var v = pieces[i + offs];
					var hemiSign = hemiHash[v];
					if (hemiSign) {
					    offs = i + 1;
					    break;
					}
					out += v / factors[i];
				    }
				    return out * hemiSign;
				}

				lat = deg({N:1, S:-1});
				lon = deg({E:1, W:-1, O:1});
			    }
			}
		    }
		    if ( !isNaN(lat) && !isNaN(lon) ) {
			href = 'geo:' + lat + ',' + lon;
			linkNode.setAttribute( 'href', href );
		    }
		}
		
		if ( rel ) {
		    
		    /* Add 'external' class to external links */
		    if ( rel.substring( 0, 10 ) === 'mw:ExtLink' || 
			 rel === 'mw:WikiLink/Interwiki' ) {
			linkNode.setAttribute( 'class', concatenateToAttribute( linkNode.getAttribute( 'class' ), 'external' ) );
		    }
		    
		    /* Check if the link is "valid" */
		    if ( ! href ) {
			console.error( 'No href attribute in the following code, in article ' + articleId );
			console.error( linkNode.outerHTML );
			process.exit(1);
		    }
		    
		    /* Rewrite external links starting with // */
		    if ( rel.substring( 0, 10 ) === 'mw:ExtLink' || rel == 'nofollow' ) {
			if ( href.substring( 0, 1 ) === '/' ) {
			    linkNode.setAttribute( 'href', getFullUrl( href ) );
			} else if ( href.substring( 0, 2 ) === './' ) {
			    while ( linkNode.firstChild ) {
				linkNode.parentNode.insertBefore( linkNode.firstChild, linkNode);
			    }
			    linkNode.parentNode.removeChild( linkNode );
			}
			finished();
		    }
		    
		    /* Remove internal links pointing to no mirrored articles */
		    else if ( rel == 'mw:WikiLink' ) {
			var targetId = extractTargetIdFromHref( href );
			
			/* Deal with local anchor */
			var localAnchor = '';
			if ( targetId.lastIndexOf("#") != -1 ) {
			    localAnchor = targetId.substr( targetId.lastIndexOf( '#' ) );
			    targetId = targetId.substr( 0, targetId.lastIndexOf( '#' ) );
			}
			
			if ( isMirrored( targetId ) ) {
			    linkNode.setAttribute( 'href', getArticleUrl( targetId ) + localAnchor );
			    finished();
			} else {
			    try {
				redisClient.hexists( redisRedirectsDatabase, targetId, function( error, res ) {
				    if ( error ) {
					console.error( 'Unable to check redirect existence with redis: ' + error );
					process.exit( 1 );
				    } else {
					if ( res ) {
					    linkNode.setAttribute( 'href', getArticleUrl( targetId ) );
					} else {
					    while ( linkNode.firstChild ) {
						linkNode.parentNode.insertBefore( linkNode.firstChild, linkNode);
					    }
					    linkNode.parentNode.removeChild( linkNode );
					}
				    }
				    finished();
				});
			    } catch ( error ) {
				console.error ( "Exception by requesting redis " + error );
				process.exit( 1 );
			    }
			}
		    }
		} else {
		    var targetId = extractTargetIdFromHref( href );
		    if ( targetId ) {
			if ( isMirrored( targetId ) ) {
			    linkNode.setAttribute( 'href', getArticleUrl( targetId ) );
			    finished();
			} else {
			    redisClient.hexists( redisRedirectsDatabase, targetId, function( error, res ) {
				if ( error ) {
				    console.error( 'Unable to check redirect existence with redis: ' + error );
				    process.exit( 1 );
				} else {
				    if ( res ) {
					linkNode.setAttribute( 'href', getArticleUrl( targetId ) );
				    } else {
					while ( linkNode.firstChild ) {
					    linkNode.parentNode.insertBefore( linkNode.firstChild, linkNode);
					}
					linkNode.parentNode.removeChild( linkNode );
				    }
				}
				finished();
			    });
			}
		    } else {
			finished();
		    }
		}
	    }
	}
	
	async.eachLimit( linkNodes, speed, rewriteUrl, function( error ) {
	    if ( error ) {
		console.error( 'Problem by rewriting urls: ' + error );
		process.exit( 1 );
	    } else {
		finished( null, parsoidDoc, articleId );
	    }
	});
    }
    
    function applyOtherTreatments( parsoidDoc, articleId, finished ) {
	
	/* Go through gallerybox */
	var galleryboxes = parsoidDoc.getElementsByClassName( 'gallerybox' );
	for ( var i = 0; i < galleryboxes.length ; i++ ) {
	    if ( ( ! galleryboxes[i].getElementsByClassName( 'thumb' ).length ) || ( nopic ) ) {
		deleteNode( galleryboxes[i] );
	    }
	}
	
	/* Remove "map" tags if necessary */
	if ( nopic ) {
	    var maps = parsoidDoc.getElementsByTagName( 'map' );
	    for ( var i = 0; i < maps.length ; i++ ) {
		deleteNode( maps[i] );
	    }
	}
	
	/* Go through all reference calls */
	var spans = parsoidDoc.getElementsByTagName( 'span' );
	for ( var i = 0; i < spans.length ; i++ ) {
	    var span = spans[i];
	    var rel = span.getAttribute( 'rel' );
	    if ( rel === 'dc:references' ) {
		var sup = parsoidDoc.createElement( 'sup' );
		if ( span.innerHTML ) {
		    sup.id = span.id;
		    sup.innerHTML = span.innerHTML;
		    span.parentNode.replaceChild( sup, span );
		} else {
		    deleteNode( span );
		}
	    }
	}
	
	/* Remove element with id in the blacklist */
	idBlackList.map( function( id ) {
	    var node = parsoidDoc.getElementById( id );
	    if ( node ) {
		deleteNode( node );
	    }
	});
	
	/* Remove element with black listed CSS classes */
	cssClassBlackList.map( function( classname ) {
	    var nodes = parsoidDoc.getElementsByClassName( classname );
	    for ( var i = 0; i < nodes.length ; i++ ) {
		deleteNode( nodes[i] );
	    }
	});
	
	/* Remove element with black listed CSS classes and no link */
	cssClassBlackListIfNoLink.map( function( classname ) {
	    var nodes = parsoidDoc.getElementsByClassName( classname );
	    for ( var i = 0; i < nodes.length ; i++ ) {
		if ( nodes[i].getElementsByTagName( 'a' ).length === 0 ) {
		    deleteNode( nodes[i] );
		}
	    }
	});
	
	/* Remove link tags */
	var links = parsoidDoc.getElementsByTagName( 'link' );
	for ( var i = 0; i < links.length ; i++ ) {
	    deleteNode( links[i] );
	};
	
	/* Remove useless DOM nodes without children */
	var tagNames = [ 'li', 'span' ];
	tagNames.map( function( tagName ) {
	    var nodes = parsoidDoc.getElementsByTagName( tagName );
	    for ( var i = 0; i < nodes.length ; i++ ) {
	        if ( ! nodes[i].innerHTML ) {
		    deleteNode( nodes[i] );
		}
	    };
	});
	
	/* Remove useless input nodes */
	var inputNodes = parsoidDoc.getElementsByTagName( 'input' );
	for ( var i = 0; i < inputNodes.length ; i++ ) {
	    deleteNode( inputNodes[i] );
	};

	/* Remove empty paragraphs */
	if ( !keepEmptyParagraphs ) {
            for ( var level = 5; level > 0; level-- ) {
		var paragraphNodes = parsoidDoc.getElementsByTagName( 'h' + level );
		for ( var i = 0; i < paragraphNodes.length ; i++ ) {
		    var paragraphNode = paragraphNodes[i];
                    var nextElementNode = getNextSiblingElement( paragraphNode );

		    /* No nodes */
                    if ( !nextElementNode ) {
			deleteNode( paragraphNode );
                    } else {

                        /* Delete if nextElementNode is a paragraph with <= level */
			var nextElementNodeTag = nextElementNode.tagName.toLowerCase();
			if ( nextElementNodeTag.length > 1 && nextElementNodeTag[0] == 'h' && 
			     !isNaN( nextElementNodeTag[1] ) && nextElementNodeTag[1] <= level ) {
                            deleteNode( paragraphNode );
			}
                    }
		}
            }
	}
	
	/* Clean the DOM of all uncessary code */
	var allNodes = parsoidDoc.getElementsByTagName( '*' );
	for ( var i = 0; i < allNodes.length ; i++ ) {                                                                                
	    var node = allNodes[i];
	    node.removeAttribute( 'data-parsoid' );
	    node.removeAttribute( 'typeof' );
	    node.removeAttribute( 'about' );
	    node.removeAttribute( 'data-mw' );
	    
	    if ( node.getAttribute( 'rel' ) && node.getAttribute( 'rel' ).substr( 0, 3 ) === 'mw:' ) {
		node.removeAttribute( 'rel' );
	    }
	    
	    /* Remove a few css calls */
	    cssClassCallsBlackList.map( function( classname )  {
		if ( node.getAttribute( 'class' ) ) {
		    node.setAttribute( 'class', node.getAttribute( 'class' ).replace( classname, '' ) );
		}
	    });
	}
	
	finished( null, parsoidDoc, articleId );
    }
    
    function setFooter( parsoidDoc, articleId, finished ) {
	var htmlTemplateDoc = domino.createDocument( htmlTemplateCode );
	
	/* Create final document by merging template and parsoid documents */
	htmlTemplateDoc.getElementById( 'mw-content-text' ).innerHTML = parsoidDoc.getElementsByTagName( 'body' )[0].innerHTML;
	htmlTemplateDoc.getElementsByTagName( 'title' )[0].innerHTML =
	    parsoidDoc.getElementsByTagName( 'title' ) ? parsoidDoc.getElementsByTagName( 'title' )[0].innerHTML.replace( /_/g, ' ' ) : articleId.replace( /_/g, ' ' );
	htmlTemplateDoc.getElementById( 'titleHeading' ).innerHTML = htmlTemplateDoc.getElementsByTagName( 'title' )[0].innerHTML;
	
	/* Subpage */
	if ( isSubpage( articleId ) ) {
	    var contentNode = htmlTemplateDoc.getElementById( 'content' );
	    var headingNode = htmlTemplateDoc.getElementById( 'mw-content-text' );
	    var subpagesNode = htmlTemplateDoc.createElement( 'span' );
	    var parents = articleId.split( '/' ); parents.pop();
	    var subpages = '';
	    var parentPath = '';
	    parents.map( function( parent ) {
		var label = parent.replace( /_/g, ' ' );
		var isParentMirrored = isMirrored( parentPath + parent );
		subpages += '&lt; ' + ( isParentMirrored ? '<a href="' + getArticleUrl( parentPath + parent ) + '" title="' + label + '">' : '' ) 
		    + label + ( isParentMirrored ? '</a> ' : ' ' );
		parentPath += parent + '/';
	    });
	    subpagesNode.innerHTML = subpages;
	    subpagesNode.setAttribute( 'class', 'subpages' );
	    contentNode.insertBefore( subpagesNode, headingNode );
	}

	/* Set footer */
	var div = htmlTemplateDoc.createElement( 'div' );
	var oldId = articleIds[ articleId ];
	redisClient.hget( redisArticleDetailsDatabase, articleId, function( error, timestamp ) {
	    if ( error ) {
		finished( 'Unable to get the timestamp from redis for article ' + articleId + ': ' + error );
	    } else {
		var date = new Date( timestamp );
		div.innerHTML = footerTemplate( { articleId: encodeURIComponent( articleId ), webUrl: webUrl, name: name, oldId: oldId, date: date.toLocaleDateString("en-US") } );
		htmlTemplateDoc.getElementById( 'mw-content-text' ).appendChild( div );
		finished( null, htmlTemplateDoc, articleId );
	    }
	});
    }
    
    function writeArticle( doc, articleId, finished ) {
	printLog( 'Saving article ' + articleId + '...' );
	var html = doc.documentElement.outerHTML;

	if ( minifyHtml ) {
	    html = htmlMinifier.minify( html, {
		removeComments: true,
		conservativeCollapse: true,
		collapseBooleanAttributes: true,
		removeRedundantAttributes: true,
		removeEmptyAttributes: true,
		minifyCSS: true
            } );
	}

	if ( deflateTmpHtml ) {
	    zlib.deflate( html, function( error, deflatedHtml ) {
		fs.writeFile( getArticlePath( articleId ), deflatedHtml, finished );
	    });
	} else {
	    fs.writeFile( getArticlePath( articleId ), html, finished );
	}
    }

    function saveArticle( articleId, finished ) {
	var articleUrl = parsoidUrl + encodeURIComponent( articleId ) + ( parsoidUrl.indexOf( 'rest.wikimedia.org' ) < 0 ? '?oldid=' : '/' ) + articleIds[ articleId ];
	printLog( 'Getting article from ' + articleUrl );
	setTimeout( skipHtmlCache ? downloadContent : downloadContentAndCache, downloadFileQueue.length() + optimizationQueue.length(), articleUrl, function( content, responseHeaders, articleId ) {
	    var html = content.toString();
	    if ( html ) {
		var articlePath = getArticlePath( articleId );
		var prepareAndSaveArticle = async.compose( writeArticle, setFooter, applyOtherTreatments, rewriteUrls, treatMedias, parseHtml );
		
		printLog( 'Treating and saving article ' + articleId + ' at ' + articlePath + '...' );
		prepareAndSaveArticle( html, articleId, function ( error, result ) {
		    if ( error ) {
			console.error( 'Error by preparing and saving file ' + error );
			process.exit( 1 );
		    } else {
			printLog( 'Dumped successfully article ' + articleId );
			finished();
		    }
		});
	    } else {
		delete articleIds[ articleId ];
		finished();
	    }
	}, articleId );
    }

    printLog( 'Saving articles...' );
    async.eachLimit( Object.keys( articleIds ), speed, saveArticle, function( error ) {
	if ( error ) {
	    console.error( 'Unable to retrieve an article correctly: ' + error );
	    process.exit( 1 );
	} else {
	    printLog( 'All articles were retrieved and saved.' );
	    finished();
	}
    });
}

function isMirrored( id ) {
    if ( !articleList && id && id.indexOf( ':' ) >= 0 ) {
	var namespace = namespaces[ id.substring( 0, id.indexOf( ':' ) ).replace( / /g, '_' ) ];
	if ( namespace != undefined ) {
	    return namespace.isContent
	}
    }
    return ( id in articleIds );
}

function isSubpage( id ) {
    if ( id && id.indexOf( '/' ) >= 0 ) {
	var namespace = id.indexOf( ':' ) >= 0 ? id.substring( 0, id.indexOf( ':' ) ).replace( / /g, '_' ) : "";
	var namespace = namespaces[ namespace ];
	if ( namespace != undefined ) {
	    return namespace.allowedSubpages;
	}
    }
    return false;
}

/* Grab and concatenate javascript files */
function saveJavascript( finished ) {
    printLog( 'Creating javascript...' );
    
    jsdom.defaultDocumentFeatures = {
	FetchExternalResources   : ['script'],
	ProcessExternalResources : ['script'],
	MutationEvents           : '2.0',
    }

    printLog( 'Get the javascript from ' + webUrl );
    downloadContent( webUrl, function( content, responseHeaders ) {
	var html = content.toString().replace( '<head>', '<head><base href="' + mwUrl + '" />' );

	// Create a dummy JS file to be executed asynchronously in place of loader.php
	var dummyPath = htmlRootPath + javascriptDirectory + '/local.js';
	printLog( 'Writting dummy js at' + dummyPath );
	fs.writeFileSync( dummyPath, 'console.log( "mw.loader not supported" );' );
	
	/* Backward compatibility for old version of jsdom */
	var window;
	try {
	    window = jsdom.jsdom( html ).parentView || jsdom.jsdom( html ).defaultView;
	} catch ( error ) {
	    printLog( 'Unable to call jsdom.jsdom( html ).parentWindow without crashing, try an other way.' );
	    window = jsdom.jsdom( html ).createWindow();
	}
	
	/* Try to detect all javascript code included */
	printLog( 'Adding load listener on window' );
	window.addEventListener( 'load', function () {
	    printLog( 'Going through scripts in head and body to dump javascript...' );
	    var nodeNames = [ 'head', 'body' ];
	    async.map( nodeNames,
		       function( nodeName, finished ) {
			   var node = window.document.getElementsByTagName( nodeName )[0];
			   var scripts = node.getElementsByTagName( 'script' );
			   var javascriptPath = htmlRootPath + javascriptDirectory + '/' + nodeName + '.js';
			   
			   fs.unlink( javascriptPath, function() {
			       var scriptIncrementor = 0;
			       async.whilst(
				   function() {
				       scriptIncrementor < scripts.length;
				   },
				   function( finished ) {
				       var script = scripts[ scriptIncrementor ];
				       var url = script.getAttribute( 'src' );
				       var munge_js = function( txt ) {
					   txt = txt.replace( RegExp( '//bits.wikimedia.org/.*.wikipedia.org/load.php', 'g' ), javascriptDirectory + '/local.js' );
					   return txt;
				       }
				       
				       if ( url ) {
					   url = getFullUrl( url ).replace( 'debug=false', 'debug=true' );
					   printLog( 'Downloading javascript from ' + url );
					   downloadContent( url, function( content, responseHeaders ) {
					       fs.appendFile( javascriptPath, '\n' + munge_js( content.toString() ) + '\n', function ( error ) {
						   finished();
					       } );
					   });
				       } else {
					   fs.appendFile( javascriptPath, '\n' + munge_js( script.innerHTML ) + '\n', function ( error ) {
					       finished();
					   } );
				       }
				   },
				   function( error ) {
				       finished();
				   });
			   });
		       },
	               function( error, result ) {
			   finished();
		       });
	});
	printLog( 'Listener (to load javascript added to window)...' );
    });
}

/* Grab and concatenate stylesheet files */
function saveStylesheet( finished ) {
    printLog( 'Dumping stylesheets...' );
    var urlCache = new Object();
    var stylePath = htmlRootPath + styleDirectory + '/style.css';

    /* Remove if exists */
    fs.unlink( stylePath, function() {} );

    /* Take care to download medias */
    var downloadCSSFileQueue = async.queue( function ( data, finished ) {
	if ( data.url && data.path ) {
	    downloadFile( data.url, data.path, true, finished );
	} else {
	    finished();
	}
    }, speed );

    /* Take care to download CSS files */
    var downloadCSSQueue = async.queue( function ( link, finished ) {

	/* link might be a 'link' DOM node or an URL */
	var cssUrl = typeof link == 'object' ? getFullUrl( link.getAttribute( 'href' ) ) : link;
	var linkMedia = typeof link == 'object' ? link.getAttribute( 'media' ) : null;

	if ( cssUrl ) {
	    var cssUrlRegexp = new RegExp( 'url\\([\'"]{0,1}(.+?)[\'"]{0,1}\\)', 'gi' );
	    var cssDataUrlRegex = new RegExp( '^data' );
	    
	    printLog( 'Downloading CSS from ' + decodeURI( cssUrl ) );
	    downloadContent( cssUrl, function( content, responseHeaders ) {
		var body = content.toString();

		var rewrittenCss = '\n/* start ' + cssUrl + ' */\n\n';
		rewrittenCss += linkMedia ? '@media ' + linkMedia + '  {\n' : '\n';
		rewrittenCss += body + '\n';
		rewrittenCss += linkMedia ? '} /* @media ' + linkMedia + ' */\n' : '\n';
		rewrittenCss += '\n/* end   ' + cssUrl + ' */\n';

		/* Downloading CSS dependencies */
		var match;
		while ( match = cssUrlRegexp.exec( body ) ) {
		    var url = match[1];
		    
		    /* Avoid 'data', so no url dependency */
		    if ( ! url.match( '^data' ) ) {
			var filename = pathParser.basename( urlParser.parse( url, false, true ).pathname );
			
			/* Rewrite the CSS */
			rewrittenCss = rewrittenCss.replace( url, filename );
			
			/* Need a rewrite if url doesn't include protocol */
			url = getFullUrl( url, cssUrl );
			
			/* Download CSS dependency, but avoid duplicate calls */
			if ( !urlCache.hasOwnProperty( url ) ) {
			    urlCache[url] = true;
			    downloadCSSFileQueue.push( { url: url, path: htmlRootPath + styleDirectory + '/' + filename } );
			}
		    }
		}
		
		fs.appendFileSync( stylePath, rewrittenCss );
		finished();
	    });
	} else {
	    finished();
	}

    }, speed );

    /* Load main page to see which CSS files are needed */
    downloadContentAndCache( webUrl, function( content, responseHeaders ) {
	var html = content.toString();
	var doc = domino.createDocument( html );
	var links = doc.getElementsByTagName( 'link' );

	/* Go through all CSS links */
	for ( var i = 0; i < links.length ; i++ ) {
	    var link = links[i];
	    if ( link.getAttribute( 'rel' ) === 'stylesheet' ) {
		downloadCSSQueue.push( link );
	    }
	}

	/* Push Mediawiki:Offline.css ( at the end) */
	downloadCSSQueue.push( webUrl + 'Mediawiki:offline.css?action=raw' );

	/* Set the drain method to be called one time everything is done */
	downloadCSSQueue.drain = function( error ) {
	    if ( error ) {
		console.error( 'Error by CSS dependencies: ' + error );
		process.exit( 1 );
	    } else {
		downloadCSSFileQueue.drain = function( error ) {
		    if ( error ) {
			console.error( 'Error by CSS medias: ' + error );
			process.exit( 1 );
		    } else {
			finished();
		    }
		};
		downloadCSSFileQueue.push( '' );
	    }
	};
	downloadCSSQueue.push( '' );
    });
}

/* Get ids */
var redirectQueue = async.queue( function( articleId, finished ) {
    if ( articleId ) {
        printLog( 'Getting redirects for article ' + articleId + '...' );
	var url = apiUrl + 'action=query&list=backlinks&blfilterredir=redirects&bllimit=500&format=json&bltitle=' + encodeURIComponent( articleId ) + '&rawcontinue=';
	downloadContent( url, function( content, responseHeaders ) {
	    var body = content.toString();
	    try {
		if ( !JSON.parse( body )['error'] ) {
		    var redirects = new Object();
		    var redirectsCount = 0;
		    JSON.parse( body )['query']['backlinks'].map( function( entry ) {
			redirects[ entry['title'].replace( / /g, '_' ) ] = articleId;
			redirectsCount++;
		    });
		    printLog( redirectsCount + ' redirect(s) found for ' + articleId );
		    if ( redirectsCount ) {
			redisClient.hmset( redisRedirectsDatabase, redirects, function ( error ) {
			    finished();
			});
		    } else {
			finished();
		    }
		} else {
		    finished( JSON.parse( body )['error'] );
		}
	    } catch( error ) {
		finished( error );
	    }
	});
    } else {
	finished();
    }
}, speed * 3 );

function getArticleIds( finished ) {

    function drainRedirectQueue( finished ) {
	redirectQueue.drain = function( error ) {
	    if ( error ) {
		console.error( 'Unable to retrieve redirects for an article: ' + error );
		process.exit( 1 );
	    } else {
		printLog( 'All redirect ids retrieve successfuly.' );
		finished();
	    }
	};
	redirectQueue.push( '' );
    }
    
    /* Parse article list given by API */
    function parseJson( body ) {
	var next = '';

	try {
	    var json = JSON.parse( body );
	    var entries = json['query']['pages'];
	    var redirectQueueValues = new Array();
	    var details = new Object();
	    Object.keys( entries ).map( function( key ) {
		var entry = entries[key];
		entry['title'] = entry['title'].replace( / /g, '_' );
		if ( entry['revisions'] !== undefined ) {
		    articleIds[entry['title']] = entry['revisions'][0]['revid'];
		    details[entry['title']] = entry['revisions'][0]['timestamp'];
		    redirectQueueValues.push( entry['title'] );
		}
	    });
	    if ( redirectQueueValues.length )
		redirectQueue.push( redirectQueueValues );
	    if ( Object.keys( details ).length ) {
		redisClient.hmset( redisArticleDetailsDatabase, details );
	    }

	    /* Get continue parameters from 'query-continue',
	     * unfortunately old MW version does not use the same way
	     * than recent */
	    var continueHash = json['query-continue'] && json['query-continue']['allpages'];
	    if ( continueHash ) {
		for ( var key in continueHash ) {
		    next += '&' + key + '=' + encodeURIComponent( continueHash[key] );
		}
	    }
	} catch ( error ) {
	    console.error( 'Unable to parse JSON and redirects: '  + error );
	}

	return next;
    }

    /* Get ids from file */
    function getArticleIdsForLine( line, finished ) {
	if ( line ) {
	    var title = line.replace( / /g, '_' );
	    var url = apiUrl + 'action=query&redirects&format=json&prop=revisions&titles=' + encodeURIComponent( title ) + '&rawcontinue=';
	    setTimeout( downloadContent, redirectQueue.length() > 30000 ? redirectQueue.length() - 30000 : 0, url, function( content, responseHeaders ) {
		var body = content.toString();
		if ( body && body.length > 1 ) {
		    parseJson( body );
		}
		setTimeout( finished, redirectQueue.length() );
	    });
	} else {
	    finished();
        }
    }

    function getArticleIdsForFile() {
	var lines = fs.readFileSync( articleList ).toString().split( '\n' );
	async.eachLimit( lines, speed, getArticleIdsForLine, function( error ) {
	    if ( error ) {
		console.error( 'Unable to get all article ids for a file: ' + error );
		process.exit( 1 );
	    } else {
		printLog( 'List of article ids to mirror completed' );
		drainRedirectQueue( finished );
	    }
	});
    }

    /* Get ids from Mediawiki API */
    function getArticleIdsForNamespace( namespace, finished ) {
	var next = '';
	
	async.doWhilst(
	    function ( finished ) {
		printLog( 'Getting article ids for namespace "' + namespace + '" ' + ( next != '' ? ' (from ' + ( namespace ? namespace + ':' : '') + next.split( '=' )[1] + ')' : '' ) + '...' );
		var url = apiUrl + 'action=query&generator=allpages&gapfilterredir=nonredirects&gaplimit=500&prop=revisions&gapnamespace=' + namespaces[ namespace ].number + '&format=json' + '&rawcontinue=' + next;
		setTimeout( downloadContent, redirectQueue.length() > 30000 ? redirectQueue.length() - 30000 : 0, url, function( content, responseHeaders ) {
		    printLog( 'Redirect queue size: ' + redirectQueue.length() );
		    var body = content.toString();
		    if ( body && body.length > 1 ) {
			next = parseJson( body );
			finished();
		    } else {
			next = '';
			finished( 'error by retrieving ' + url );
		    }
		});
	    },
	    function () { return next },
	    function ( error ) {
		if ( error ) {
		    console.error( 'Unable to download article ids: ' + error );
		    process.exit( 1 );
		} else {
		    printLog( 'List of article ids to mirror completed for namespace "' +  namespace + '"' );
		    finished();
		}
	    }
	);
    }
    
    function getArticleIdsForNamespaces() {
	async.eachLimit( namespacesToMirror, namespacesToMirror.length, getArticleIdsForNamespace, function( error ) {
	    if ( error ) {
		console.error( 'Unable to get all article ids for in a namespace: ' + error );
		process.exit( 1 );
	    } else {
		printLog( 'All articles ids (but without redirect ids) for all namespaces were successfuly retrieved.' );
		drainRedirectQueue( finished );
	    }
	});
    }
	
    /* Get list of article ids */
    if ( articleList ) {
	getArticleIdsForFile();
    } else {
	getArticleIdsForNamespaces();
    }
}

/* Create directories for static files */
function createSubDirectories( finished ) {
    printLog( 'Creating sub directories at \"' + htmlRootPath + '\"...' );
    async.series(
        [
	    function( finished ) { exec( 'rm -rf \"' + htmlRootPath + '\"', finished ) },
	    function( finished ) { fs.mkdir( htmlRootPath, undefined, finished ) },
	    function( finished ) { fs.mkdir( htmlRootPath + styleDirectory, undefined, finished ) },
	    function( finished ) { fs.mkdir( htmlRootPath + mediaDirectory, undefined, finished ) },
	    function( finished ) { fs.mkdir( htmlRootPath + javascriptDirectory, undefined, finished ) }
	],
	function( error ) {
	    if ( error ) {
		console.error( 'Unable to create mandatory directories : ' + error );
		process.exit( 1 );
	    } else {
		finished();
	    }
	});
}

/* Multiple developer friendly functions */
function getFullUrl( url, baseUrl ) {
    var urlObject = urlParser.parse( url, false, true );

    if ( ! urlObject.protocol ) {

	var baseUrlObject = baseUrl ? urlParser.parse( baseUrl, false, true ) : {};
	urlObject.protocol = urlObject.protocol || baseUrlObject.protocol || 'http:';
	urlObject.host = urlObject.host || baseUrlObject.host || webUrlHost;

	/* Relative path */
	if ( urlObject.pathname && urlObject.pathname.indexOf( '/' ) != 0 && baseUrlObject.pathname ) {
	    urlObject.pathname = pathParser.dirname( baseUrlObject.pathname ) + '/' + urlObject.pathname;
	}

	url = urlParser.format( urlObject );
    }

    return url;
}

function deleteNode( node ) {
    if ( node.parentNode ) {
	node.parentNode.removeChild( node );
    } else {
	node.outerHTML = '';
    }
    node = undefined;
}

function concatenateToAttribute( old, add ) {
    return old ? old + ' ' + add : add;
}

function downloadContentAndCache( url, callback, var1, var2, var3 ) {
    var cachePath = cacheDirectory + crypto.createHash( 'sha1' ).update( url ).digest( 'hex' ).substr( 0, 20 );
    var cacheHeadersPath = cachePath + '.h';

    async.series( 
	[
	    function( finished ) {
		fs.readFile( cachePath, function( error, data ) {
		    finished( error, error ? undefined : data.toString() );
		})
	    },
	    function( finished ) {
		fs.readFile( cacheHeadersPath, function( error, data ) {
		    try {
			finished( error, error ? undefined : JSON.parse( data.toString() ) );
		    } catch ( error ) {
			finished( 'Error in downloadContentAndCache() JSON parsing of ' + cacheHeadersPath + ', error is: ' + error );
		    }
		});
	    }
	],
	function( error, results ) {
	    if ( error ) {
		downloadContent( url, function( content, responseHeaders ) {
		    printLog( 'Caching ' + url + ' at ' + cachePath + '...' );
		    fs.writeFile( cacheHeadersPath, JSON.stringify( responseHeaders ), function( error ) {
			fs.writeFile( cachePath, content, function( error ) {
			    callback( content, responseHeaders, var1, var2, var3 );
			});
		    });
		});
	    } else {
		printLog( 'Cache hit for ' + url + ' (' + cachePath + ')' );
		touch( cachePath, cacheHeadersPath );
		callback( results[0], results[1], var1, var2, var3 );
	    }
	}
    );
}

function getRequestOptionsFromUrl( url, compression ) {
    var urlObj = urlParser.parse( url );
    var port = urlObj.port ? urlObj.port : ( urlObj.protocol && urlObj.protocol.substring( 0, 5 ) == 'https' ? 443 : 80 );
    var headers = {
	'accept-encoding': ( compression ? 'gzip,deflate' : '' ),
	'user-agent': userAgentString
    };

    return {
	protocol: urlObj.protocol,
	hostname: urlObj.hostname,
	port: port,
	headers: headers,
	path: urlObj.path,
	keepAlive: true
    };
}

function downloadContent( url, callback, var1, var2, var3 ) {
    var retryCount = 0;
    var responseHeaders = {};

    printLog( 'Downloading ' + decodeURI( url ) + '...' );
    async.retry(
	5,
	function( finished ) {
	    var request;
	    var calledFinished = false;
	    function callFinished( timeout, message, data ) {
		if ( !calledFinished ) {		    
		    calledFinished = true;
		    if ( message ) {
			console.error( message );
			request.abort();
		    }
		    request = undefined;
		    setTimeout( finished, timeout, message, data );
		}
	    }
	    
	    retryCount++;
	    var options = getRequestOptionsFromUrl( url, true );
	    request = ( options.protocol == 'http:' ? http : https ).get( options, function( response ) {
		if ( response.statusCode == 200 ) {
		    var chunks = new Array();
		    response.on( 'data', function ( chunk ) {
			chunks.push( chunk );
		    });
		    response.on( 'end', function() {
			responseHeaders = response.headers;
			var encoding = responseHeaders['content-encoding'];
			if ( encoding == 'gzip' ) {
			    zlib.gunzip( Buffer.concat( chunks ), function( error, decoded ) {
				callFinished( 0, error, decoded && decoded.toString() );
			    });
			} else if ( encoding == 'deflate' ) {
			    zlib.inflate( Buffer.concat( chunks ), function( error, decoded ) {
				callFinished( 0, error, decoded && decoded.toString() );
			    })
			} else {
			    callFinished( 0, null, Buffer.concat( chunks ) );
			} 
		    });
		    response.on( 'error', function( error) {
			socket.emit( 'agentRemove' );
			socket.destroy();
			callFinished( 0, 'Unable to download content [' + retryCount + '] ' + decodeURI( url ) + ' (response error: ' + response.statusCode + ').' );
		    });
		} else {
		    response.socket.emit( 'agentRemove' );
		    response.socket.destroy();
		    callFinished( 0, 'Unable to download content [' + retryCount + '] ' + decodeURI( url ) + ' (statusCode=' + response.statusCode + ').' );
		}
	    });
	    request.on( 'error', function( error ) {
		callFinished( 10000 * retryCount, 'Unable to download content [' + retryCount + '] ' + decodeURI( url ) + ' (request error: ' + error + ' ).' );
	    });
	    request.on( 'socket', function ( socket ) {
		if ( !socket.custom ) {
		    socket.custom = true;
		    socket.on( 'error', function( error ) {
			console.error( 'Socket timeout' );
			socket.emit( 'agentRemove' );
			socket.destroy();
			if ( request ) { request.emit( 'error', 'Socket timeout' ); }
		    });
		    socket.on( 'timeout', function( error ) {
			console.error( 'Socket error' );
			socket.emit( 'agentRemove' );
			socket.end();
			if ( request ) { request.emit( 'error', 'Socket error' ); }
		    });
		}
	    });
	    request.setTimeout( requestTimeout * 1000 * retryCount );
	},
	function ( error, data ) {
	    if ( error ) {
		console.error( 'Absolutly unable to retrieve async. URL: ' + error );

		/* Unfortunately we can not do that because there are
		 * article which simply will not be parsed correctly by
		 * Parsoid. For example this one
		 * http://parsoid-lb.eqiad.wikimedia.org/dewikivoyage/Via_Jutlandica/Gpx
		 * and this stops the whole dumping process */
		// process.exit( 1 );
	    }
	    callback( data || new Buffer(0), responseHeaders, var1, var2, var3 );
	});
}

function downloadFileAndCache( url, callback ) {
    var parts = mediaRegex.exec( decodeURI( url ) );
    var filenameBase = ( parts[2].length > parts[5].length ? parts[2] : parts[5] + parts[6] + ( parts[7] || '' ) );
    var width = parseInt( parts[4].replace( /px\-/g, '' ) ) || INFINITY_WIDTH;

    /* Check if we have already met this image during this dumping process */
    redisClient.hget( redisMediaIdsDatabase, filenameBase, function( error, r_width ) {

	/* If no redis entry */
	if ( error || !r_width || r_width < width ) {

	    /* Set the redis entry if necessary */
	    redisClient.hset( redisMediaIdsDatabase, filenameBase, width, function( error ) {
		var mediaPath = getMediaPath( url );
		var cachePath = cacheDirectory + 'm/' + crypto.createHash( 'sha1' ).update( filenameBase ).digest( 'hex' ).substr( 0, 20 ) + 
		    ( pathParser.extname( urlParser.parse( url, false, true ).pathname || '' ) || '' );
		var cacheHeadersPath = cachePath + '.h';
		var toDownload = false;
		
		/* Check if the file exists in the cache */
		if ( fs.existsSync( cacheHeadersPath ) && fs.existsSync( cachePath ) ) {
		    var responseHeaders;
		    try {
			responseHeaders = JSON.parse( fs.readFileSync( cacheHeadersPath ).toString() );
		    } catch ( error ) {
			console.error( 'Error in downloadFileAndCache() JSON parsing of ' + cacheHeadersPath + ', error is: ' + error );
			responseHeaders = undefined;
		    }

		    /* If the cache file width higher than needed, use it. Otherwise download it and erase the cache */
		    if ( !responseHeaders || responseHeaders.width < width ) {
			toDownload = true;
		    } else {
			if ( !fs.existsSync( mediaPath ) ) {
			    fs.symlinkSync( cachePath, mediaPath );
			}
			touch( cachePath, cacheHeadersPath );
			if ( responseHeaders.width == width ) {
			    redisClient.hdel( redisCachedMediaToCheckDatabase, filenameBase );
			} else {
			    redisClient.hset( redisCachedMediaToCheckDatabase, filenameBase, width );
			}
			callback();
		    }
		} else {
		    toDownload = true;
		}
		
		/* Download the file if necessary */
		if ( toDownload ) {
		    downloadFile( url, cachePath, true, function( error, responseHeaders ) {
			if ( error ) {
			    callback();
			} else {
			    printLog( 'Caching ' + filenameBase + ' at ' + cachePath + '...' );
			    fs.symlink( cachePath, mediaPath, function( error ) {
				fs.writeFileSync( cacheHeadersPath, JSON.stringify( { width: width } ) );
				callback();
			    });
			}
		    });
		} else {
		    printLog( 'Cache hit for ' + url );
		}
	    });
	}
	
	/* We already have this image with a resolution equal or higher to what we need */ 
	else {
            callback();
	}
    });
}

function downloadFile( url, path, force, callback ) {
    fs.exists( path, function ( exists ) {
	if ( exists && !force ) {
	    printLog( path + ' already downloaded, download will be skipped.' );
	    callback();
	} else {
	    printLog( 'Downloading ' + decodeURI( url ) + ' at ' + path + '...' );
	    downloadContent( url, function( content, responseHeaders ) {
		    fs.writeFile( path, content, function( error ) {
			if ( error ) {
			    console.error( 'Unable to write ' + path + ' (' + url + ')' );
			} else {
			    optimizationQueue.push( {path: path, size: content.length } );
			}
			callback( error, responseHeaders );
		    });
	    });
	}
    });
}

/* Internal path/url functions */
function getMediaUrl( url ) {
    return getMediaBase( url, true );
}

function getMediaPath( url, escape ) {
    var mediaBase = getMediaBase( url, escape );
    return mediaBase ? htmlRootPath + mediaBase : undefined;
}

function getMediaBase( url, escape ) {
    var root;

    var parts = mediaRegex.exec( decodeURI( url ) );
    if ( parts ) {
        root = parts[2].length > parts[5].length ? parts[2] : parts[5];
    }
 
    if ( !root ) {
        console.error( 'Unable to parse media url \"' + url + '\"' );
        return;
    }

    function e( string ) {
	return ( string === undefined ? undefined :
		 escape ? encodeURIComponent( string ) : string );
    }

    var filenameFirstVariant = parts[2];
    var filenameSecondVariant = parts[5] + parts[6] + ( parts[7] || '' );
    var filename = myDecodeURIComponent( filenameFirstVariant.length > filenameSecondVariant.length ?
					 filenameFirstVariant : filenameSecondVariant );
    
    /* Need to shorten the file due to filesystem limitations */
    if ( unicodeCutter.getBinarySize( filename ) > 249 ) {
	var ext = pathParser.extname( filename ).split( '.' )[1] || '';
        var basename = filename.substring( 0, filename.length - ext.length - 1) || '';
	filename = unicodeCutter.truncateToBinarySize( basename, 239 - ext.length ) + crypto.createHash( 'md5' ).update( basename ).digest( 'hex' ).substring( 0, 2) + '.' + ext;
    }

    return mediaDirectory + '/' + e( filename );
}

function getArticleUrl( articleId ) {
    return getArticleBase( articleId, true );
}

function getArticlePath( articleId, escape ) {
    return htmlRootPath + getArticleBase( articleId, escape );
}

function getArticleBase( articleId, escape ) {
    var filename = articleId.replace( /\//g, '_' );
    var dirBase = filename.replace( /\./g, '_' );
    
    /* Filesystem is not able to handle with filename > 255 bytes */
    while ( Buffer.byteLength( filename, 'utf8' ) > 250 ) {
	filename = filename.substr( 0, filename.length - 1 );
    }

    function e( string ) {
	return ( string === undefined ? undefined :
		 escape ? encodeURIComponent( string ) : string );
    }

    return e( filename ) + '.html';
}

function getSubTitle( finished ) {
    printLog( 'Getting sub-title...' );
    downloadContent( webUrl, function( content, responseHeaders ) {
	var html = content.toString();
	var doc = domino.createDocument( html );
	var subTitleNode = doc.getElementById( 'siteSub' );
	subTitle = subTitleNode.innerHTML;
	finished();
    });
}

function getSiteInfo( finished ) {
    printLog( 'Getting web site name...' );
    var url = apiUrl + 'action=query&meta=siteinfo&format=json&siprop=general|namespaces|statistics|variables|category|wikidesc';
    downloadContent( url, function( content, responseHeaders ) {
	var body = content.toString();
	var entries = JSON.parse( body )['query']['general'];
	name = entries['sitename'];
	langIso2 = entries['lang'];
	countryLanguage.getLanguage( langIso2, function ( error, language ) {
	    if ( error || !language.iso639_3 ) {
		langIso3 = langIso2;
	    } else {
		langIso3 = language.iso639_3;
	    }
	    finished();
	});
    });
}

function saveFavicon( finished ) {
    printLog( 'Saving favicon.png...' );
    var faviconPath = htmlRootPath + '/favicon.png';
    
    function resizeFavicon( finished ) {
	var cmd = 'convert -thumbnail 48 "' + faviconPath + '" "' + faviconPath + '.tmp" ; mv  "' + faviconPath + '.tmp" "' + faviconPath + '" ';
	exec(cmd + ' 2>&1 > /dev/null', function( error, stdout, stderr ) {
	    fs.stat( faviconPath, function( error, stats ) {
		optimizationQueue.push( {path: faviconPath, size: stats.size}, function() {
		    finished( error );
                });
	    });
	}).on( 'error', function( error ) { console.error( error ) });
    }
    
    if ( customZimFavicon ) {
	var content = fs.readFileSync( customZimFavicon );
	fs.writeFileSync( faviconPath, content );
	resizeFavicon( finished );
    } else {
	downloadContent( apiUrl + 'action=query&meta=siteinfo&format=json', function( content, responseHeaders ) {	
	    var body = content.toString();
	    var entries = JSON.parse( body )['query']['general'];
	    var logoUrl = entries['logo'];
	    logoUrl = urlParser.parse( logoUrl ).protocol ? logoUrl : 'http:' + logoUrl;
	    downloadFile( logoUrl, faviconPath, true, function() {
		resizeFavicon( finished );
	    });
	});
    }
}

function getMainPage( finished ) {
    
    function writeMainPage( html, finished ) {
	var mainPagePath = htmlRootPath + '/index.htm';
	if ( deflateTmpHtml ) {
	    zlib.deflate( html, function( error, deflatedHtml ) {
		fs.writeFile( mainPagePath, deflatedHtml, finished );
	    });
	} else {
	    fs.writeFile( mainPagePath, html, finished );
	}
    }

    function createMainPage( finished ) {
	printLog( 'Creating main page...' );
	var doc = domino.createDocument( htmlTemplateCode );
	doc.getElementById( 'titleHeading' ).innerHTML = 'Summary';
	doc.getElementsByTagName( 'title' )[0].innerHTML = 'Summary';
	
	var html = '<ul>\n';
	Object.keys(articleIds).sort().map( function( articleId ) {
	    html = html + '<li><a href="' + getArticleBase( articleId, true ) + '"\>' + articleId.replace( /_/g, ' ' ) + '<a></li>\n';
	});
	html = html + '</ul>\n';
	doc.getElementById( 'mw-content-text' ).innerHTML = html;
	
	/* Write the static html file */
	writeMainPage( doc.documentElement.outerHTML, finished );
    }
    
    /* We have to mirror the main page even if this is not
     * in a namespace to mirror */
    function retrieveMainPage( finished ) {
	printLog( 'Getting main page...' );
	downloadContent( apiUrl + 'action=query&meta=siteinfo&format=json', function( content, responseHeaders ) {
	    var body = content.toString();
	    var entries = JSON.parse( body )['query']['general'];
	    var mainPage = entries['mainpage'];

	    if ( mainPage ) {
		var mainPageId = mainPage.replace( / /g, '_' );

		downloadContent( apiUrl + 'action=query&titles=' + encodeURIComponent( mainPageId ) + '&prop=revisions&format=json', function( content, responseHeaders ) {
		    try {
			var body = content.toString();
			var entries = JSON.parse( body )['query']['pages'];
			var pageIds = Object.keys( entries );

			/* Add article to mirror list */
			articleIds[ mainPageId ] = entries[ pageIds[0] ]['revisions'][0]['revid'];

			/* Save details about the article */
			var details = new Object();
			details[ mainPageId ] = entries[ pageIds[0] ]['revisions'][0]['timestamp'];
			redisClient.hmset( redisArticleDetailsDatabase, details );
			
			/* Create redirection html page for index.html */
			var html = redirectTemplate( { title: mainPage,
						       target : getArticleBase( mainPageId, true ) } );
			writeMainPage( html, finished );
		    } catch ( error ) {
			console.error( 'Unable to get the main page revision id for "' + mainPageId + '": ' + error );
			process.exit( 1 );
		    }
		});
	    } else {
		console.error( 'Unable to get the main page' );
		process.exit( 1 );
	    };
	});
    }

    if ( articleList ) {
	createMainPage( finished );
    } else {
	retrieveMainPage( finished );
    }
}

function getNamespaces( finished ) {
    var url = apiUrl + 'action=query&meta=siteinfo&siprop=namespaces|namespacealiases&format=json';
    downloadContent( url, function( content, responseHeaders ) { 
	var body = content.toString();
	var types = [ 'namespaces', 'namespacealiases' ];
	types.map( function( type ) {
	    var entries = JSON.parse( body )['query'][type];
	    Object.keys(entries).map( function( key ) {
		var entry = entries[key];
		var name = entry['*'].replace( / /g, '_' );
		var number = entry['id'];
		var allowedSubpages = ( 'subpages' in entry );
		var isContent = entry['content'] != undefined ? true : false;
		var canonical = entry['canonical'] ? entry['canonical'].replace( / /g, '_' ) : '';
		var details = { 'number': number, 'allowedSubpages': allowedSubpages, 'isContent': isContent };

		/* Namespaces in local language */
		namespaces[ lcFirst( name ) ] = details;
		namespaces[ ucFirst( name ) ] = details;

		/* Namespaces in English (if available) */
		if ( canonical ) {
		    namespaces[ lcFirst( canonical ) ] = details;
		    namespaces[ ucFirst( canonical ) ] = details;
		}

		/* Is content to mirror */
		if ( isContent ) {
		    namespacesToMirror.push( name );
		}
	    });
	});
	
	finished();
    });
}

function getTextDirection( finished ) {
    printLog( 'Getting text direction...' );

    downloadContent( webUrl, function( content, responseHeaders ) {
	var body = content.toString();
	var doc = domino.createDocument( body );
	var contentNode = doc.getElementById( 'mw-content-text' );
	var languageDirectionRegex = /\"pageLanguageDir\"\:\"(.*?)\"/;
	var parts = languageDirectionRegex.exec( body );
	if ( parts && parts[ 1 ] ) {
	    ltr = ( parts[ 1 ] === 'ltr' );
	} else if ( contentNode ) {
	    ltr = ( contentNode.getAttribute( 'dir' ) == 'ltr' ? true : false );
	} else {
	    printLog( 'Unable to get the language direction, fallback to ltr' );
	    ltr = true;
	};

	/* Update alignement values */
	autoAlign = ltr ? 'left' : 'right';
	revAutoAlign = ltr ? 'right' : 'left';

	printLog( 'Text direction is ' + ( ltr ? 'ltr' : 'rtl' ) );
	finished();
    });
}

function lcFirst( str ) {
    str += '';
    var f = str.charAt( 0 ).toLowerCase();
    return f + str.substr( 1 );
}

function ucFirst( str ) {
    str += '';
    var f = str.charAt( 0 ).toUpperCase();
    return f + str.substr( 1 );
}

function myDecodeURIComponent( uri ) {
    try {
	return decodeURIComponent( uri );
    } catch ( error ) {
	console.error( error );
	return uri;
    }
}

function charAt( str, idx ) {
    var ret = '';
    str += '';
    var end = str.length;

    var surrogatePairs = /[\uD800-\uDBFF][\uDC00-\uDFFF]/g;
    while ( ( surrogatePairs.exec( str ) ) != null ) {
        var li = surrogatePairs.lastIndex;
        if ( li - 2 < idx ) {
            idx++;
        } else {
            break;
        }
    }

    if ( idx >= end || idx < 0 ) {
        return '';
    }

    ret += str.charAt( idx );

    if ( /[\uD800-\uDBFF]/.test( ret ) && /[\uDC00-\uDFFF]/.test( str.charAt( idx+1 ) ) ) {
        ret += str.charAt( idx+1 );
    }

    return ret;
}

function printLog( msg ) {
    if ( verbose ) {
	console.info( msg );
    }
}

function executeTransparently( command, args, callback, nostdout, nostderr ) {
    try {
	var proc = spawn( command, args )
	    .on( 'error', function( error ) { 
		console.error( 'Error in executeTransparently(), ' + error );
		process.exit( 1 );
	    });
	
	if ( !nostdout ) {
	    proc.stdout
		.on( 'data', function ( data ) {
		    printLog( data .toString().replace( /[\n\r]/g, '' ) );
		})
		.on( 'error', function ( error ) {
		    console.error( 'STDOUT output error: ' + error );
		});
	}
	
	if ( !nostderr ) {
	    proc.stderr
		.on( 'data', function ( data ) {
		    console.error( data.toString().replace( /[\n\r]/g, '' ) );
		})
		.on( 'error', function ( error ) {
		    console.error( 'STDERR output error: ' + error );
		});
	}
	
	proc.on( 'close', function ( code ) {
	    callback( code !== 0 ? 'Error by executing ' + command : undefined );
	});
    } catch ( error ) {
	callback( 'Error by executing ' + command );
    }
}

function validateEmail( email ) { 
    var emailRegex = /^(([^<>()[\]\\.,;:\s@\"]+(\.[^<>()[\]\\.,;:\s@\"]+)*)|(\".+\"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
    return emailRegex.test( email );
}

function touch( paths ) {
    var currentDate = Date.now();
    paths = paths instanceof Array ? paths : [paths] 
    paths.map( function( path ) {
	fs.utimes( path, currentDate, currentDate );
    });
}

function getNextSiblingElement( node ) {
    var sibling = node.nextSibling;
    while ( sibling && sibling.nodeType != 1 /* ELEMENT_NODE */ ) {
        sibling = sibling.nextSibling;
    }
    return sibling;
}

process.on( 'uncaughtException', function( error ) {
    console.error( error.stack );
    process.exit( 42 );
});
