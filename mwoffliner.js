#!/usr/bin/env node
"use strict";

/************************************/
/* MODULE VARIABLE SECTION **********/
/************************************/

var fs = require( 'fs' );
var domino = require( 'domino' );
var jsdom = require( 'jsdom' );
var async = require( 'async' );
var http = require( 'follow-redirects' ).http;
var swig = require( 'swig' );
var urlParser = require( 'url' );
var pathParser = require( 'path' );
var homeDirExpander = require( 'expand-home-dir' );
var rimraf = require( 'rimraf' );
var countryLanguage = require( 'country-language' );
var request = require( 'request-enhanced' );
var redis = require( 'redis' );
var childProcess = require( 'child_process' );
var exec = require( 'child_process' ).exec;
var yargs = require( 'yargs' );
var os = require( 'os' );
var crypto = require( 'crypto' );
var unicodeCutter = require( 'utf8-binary-cutter' )

/************************************/
/* COMMAND LINE PARSING *************/
/************************************/

var argv = yargs.usage('Create a fancy HTML dump of a Mediawiki instance in a directory\nUsage: $0'
	   + '\nExample: node mwoffliner.js --mwUrl=http://en.wikipedia.org/ --parsoidUrl=http://parsoid-lb.eqiad.wikimedia.org/enwiki/')
    .require(['mwUrl', 'parsoidUrl'])
    .options(['articleList', 'outputDirectory', 'parallelRequests', 'format', 'keepHtml', 'filePrefix'])
    .describe( 'outputDirectory', 'Directory to write the downloaded content')
    .describe( 'articleList', 'File with one title (in UTF8)')
    .describe( 'format', 'To custom the output with comma separated values : "nopic,nozim"')
    .describe( 'mwURL', 'Mediawiki base URL')
    .describe( 'mwWikiPath', 'Mediawiki API path (per default "/w/api.php")')
    .describe( 'mwApiPath', 'Mediawiki wiki base path (per default "/wiki/"')
    .describe( 'parsoidURL', 'Mediawiki Parsoid URL')
    .describe( 'parallelRequests', 'Number of parallel HTTP requests')
    .describe( 'keepHtml', 'If ZIM built, keep the temporary HTML directory')
    .describe( 'verbose', 'Print debug information to the stdout' )
    .describe( 'filenamePrefix', 'For the part of the ZIM filename which is before the date part.')
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
var cssClassBlackList = [ 'noprint', 'ambox', 'stub', 'topicon', 'magnify' ]; 

/* All DOM node with these styles will be deleted if no A node is included in the sub-tree */
var cssClassBlackListIfNoLink = [ 'mainarticle', 'seealso', 'dablink', 'rellink' ];

/* List of style to be removed */
var cssClassCallsBlackList = [ 'plainlinks' ];

/* All nodes with one of these ids will be remove */
var idBlackList = [ 'purgelink' ];

/* Directory wehre everything is saved */
var outputDirectory = argv.outputDirectory ? homeDirExpander( argv.outputDirectory ) + '/' : 'static/';

/* Parsoid URL */
var parsoidUrl = argv.parsoidUrl;

/* If ZIM is built, should temporary HTML directory be kept */
var keepHtml = argv.keepHtml;

/* List of articles is maybe in a file */
var articleList = argv.articleList;

/* Prefix part of the filename (radical) */
var filenamePrefix = argv.filenamePrefix || '';

/* Wikipedia/... URL */
var mwUrl = argv.mwUrl;
var hostParts = urlParser.parse( mwUrl ).hostname.split( '.' );

/* NUmber of parallel requests */
var maxParallelRequests = argv.parallelRequests || 30;
if ( isNaN( maxParallelRequests ) ) {
    console.error( 'maxParallelRequests is not a number, please give a number value to --parallelRequests' );
    process.exit( 1 );
}

/* Verbose */
var verbose = argv.verbose;

/* ZIM publisher */
var publisher = 'Kiwix';

/* ZIM (content) creator */
var creator = hostParts[0].length > hostParts[1].length ? hostParts[0] : hostParts[1];
creator = creator.charAt( 0 ).toUpperCase() + creator.substr( 1 );

/* Namespaces to mirror */
var namespacesToMirror = new Array();

/* License footer template code */
var footerTemplateCode = '<div style="clear:both; background-image:linear-gradient(180deg, #E8E8E8, white); border-top: dashed 2px #AAAAAA; padding: 0.5em 0.5em 2em 0.5em; margin-top: 1em;">This article is issued from <a class="external text" href="{{ webUrl }}{{ articleId }}?oldid={{ oldId }}">{{ name }}</a>{% if date %} - version of the {{ date }}{% endif %}. The text is available under the <a class="external text" href="http://creativecommons.org/licenses/by-sa/3.0/">Creative Commons Attribution/Share Alike</a> but additional terms may apply for the media files.</div>';

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

var cpuCount = os.cpus().length;
var ltr = true;
var autoAlign = ltr ? 'left' : 'right';
var revAutoAlign = ltr ? 'right' : 'left';
var subTitle = 'From Wikipedia, the free encyclopedia';
var name = '';
var langIso2 = 'en';
var langIso3 = 'eng';
var articleIds = {};
var namespaces = {};
var webUrl = mwUrl + ( argv.mwWikiPath ? argv.mwWikiPath : 'wiki' ) + '/';
var apiUrl = mwUrl + ( argv.mwApiPath ? argv.mwApiPath : 'w/api.php' ) + '?';
var nopic = false;
var nozim = false;
var filenameRadical = '';
var htmlRootPath = '';

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
    exec(cmd + ' 2>&1 > /dev/null', function( error, stdout, stderr ) {
	if ( error ) {
	    console.error( 'Failed to find binary "' + cmd.split(' ')[0] + '": (' + error + ')' );
	    process.exit( 1 );
	}
    });
});

/* Setup redis client */
var redisClient = redis.createClient("/tmp/redis.sock");
var redisRedirectsDatabase = Math.floor( ( Math.random() * 10000000 ) + 1 ) + "redirects";
var redisMediaIdsDatabase = Math.floor( ( Math.random() * 10000000 ) + 1 ) + "mediaIds";
var redisArticleDetailsDatabase = Math.floor( ( Math.random() * 10000000 ) + 1 ) + "mediaIds";
redisClient.expire( redisRedirectsDatabase, 60 * 60 *24 * 30, function( error, result) {});
redisClient.expire( redisMediaIdsDatabase, 60 * 60 *24 * 30, function( error, result) {});
redisClient.expire( redisArticleDetailsDatabase, 60 * 60 *24 * 30, function( error, result) {});

/* Compile templates */
var redirectTemplate = swig.compile( redirectTemplateCode );
var footerTemplate = swig.compile( footerTemplateCode );

/* Increase the number of allowed parallel requests */
http.globalAgent.maxSockets = maxParallelRequests;

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
							 var type = stdout.replace( /image\//, '').replace( /[\n\r]/g, '' );
							 cmd = getOptimizationCommand( path, type );
							 setTimeout( function() {
							     finished( executionError );
							 }, 2000 );
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
		if ( error ) {
		    console.error( 'Failed to start to optim ' + path + ', with size=' + file.size + ' (' + error + ')' );
		}
		finished();
	    }
	});
    } else {
	finished();
    }
    
}, cpuCount );

/* Setting up the downloading queue */
var downloadMediaQueue = async.queue( function ( url, finished ) {
    if ( url ) {
	downloadMedia( url, finished );
    } else {
	finished();
    }
}, maxParallelRequests );

/* Get content */
async.series(
    [
	function( finished ) { createOutputDirectory( finished ) },
	function( finished ) { getTextDirection( finished ) },
	function( finished ) { getSubTitle( finished ) },
	function( finished ) { getSiteInfo( finished ) },
	function( finished ) { getNamespaces( finished ) },
	function( finished ) { getArticleIds( finished ) },
	function( finished ) { 
	    async.eachSeries(
		dumps,
		function( dump, finished ) {
		    printLog( 'Starting a new dump...' );
		    nopic = dump.toString().search( 'nopic' ) >= 0 ? true : false;
		    nozim = dump.toString().search( 'nozim' ) >= 0 ? true : false;
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
			    function( finished ) { drainDownloadMediaQueue( finished ) },
			    function( finished ) { drainOptimizationQueue( finished ) },
			    function( finished ) { buildZIM( finished ) },
			    function( finished ) { endProcess( finished ) }
			],
			function( error, result ) {
			    finished();
			}
		    );
		},
		function( error ) {
		    finished();
		}
	    )
	}
    ],
    function( error ) {
	printLog( 'All dumping(s) finished with success.' );
	redisClient.quit(); 
    }
);

/************************************/
/* FUNCTIONS ************************/
/************************************/

function createOutputDirectory( finished ) {
    fs.mkdir( outputDirectory, undefined, function() {
	fs.exists( outputDirectory, function ( exists ) {
	    if ( exists && fs.lstatSync( outputDirectory ).isDirectory() ) {
		finished();
	    } else {
		console.error( 'Unable to create directory \'' + outputDirectory + '\'' );
		process.exit( 1 );
	    }
	});
    });
}

function randomString( len ) {
    var randomString = '';
    var charSet = 'abcdefghijklmnopqrstuvwxyz0123456789';
    for ( var i = 0; i < len; i++ ) {
	var randomPoz = Math.floor(Math.random() * charSet.length);
	randomString += charSet.substring(randomPoz,randomPoz+1);
    }
    return randomString;
}

function computeFilenameRadical() {
    var radical;

    if ( filenamePrefix ) {
	radical = filenamePrefix + "_";
    } else {
	radical = creator.charAt( 0 ).toLowerCase() + creator.substr( 1 ) + '_';
	var hostParts = urlParser.parse( webUrl ).hostname.split( '.' );
	var langSuffix = langIso2;
	for (var i=0; i<hostParts.length; i++) {
	    if ( hostParts[i] === langIso3 ) {
		langSuffix += hostParts[i];
		break;
	    }
	}
	radical += langSuffix + '_';
	if ( articleList ) {
	    radical += pathParser.basename( articleList, pathParser.extname( articleList ) ) + '_';
	} else {
	    radical += 'all_';
	}
	radical += nopic ? 'nopic_' : '';
    }

    var date = new Date();
    radical += date.getFullYear() + '-' + ( '0' + ( date.getMonth() + 1 ) ).slice( -2 );
 
    return radical;
}

function computeHtmlRootPath() {
    var htmlRootPath = outputDirectory[0] === '/' ? outputDirectory : pathParser.resolve(  process.cwd(), outputDirectory ) + '/';
    htmlRootPath += computeFilenameRadical() + '/';
    return htmlRootPath;
}

function buildZIM( finished ) {
    if ( !nozim ) {
	var zimPath = outputDirectory + filenameRadical + '.zim';
	var cmd = 'zimwriterfs --welcome=index.html --favicon=favicon.png --language=' + langIso3 
	    + ' --title="' + name + '" --description="' + ( subTitle || name ) + '" --creator="' + creator + '" --publisher="' 
	    + publisher+ '" "' + htmlRootPath + '" "' + zimPath + '"';
	printLog( 'Building ZIM file ' + zimPath + ' (' + cmd + ')...' );

	exec(cmd + ' 2>&1 > /dev/null', function( error, stdout, stderr ) {
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
		rimraf( htmlRootPath, finished );
	    }
	});	
    } else {
	finished();
    }
}

function endProcess( finished ) {
    redisClient.flushdb( function( error, result) {
	finished();
    });
    printLog( "Dumping finished with success." );
}

function drainDownloadMediaQueue( finished ) {
    printLog( downloadMediaQueue.length() + " images still to be downloaded." );
    downloadMediaQueue.drain = function( error ) {
	if ( error ) {
	    console.error( 'Error by downloading images' + error );
	    process.exit( 1 );
	} else {
            if ( downloadMediaQueue.length() == 0 ) {
		printLog( 'All images successfuly downloaded' );
		downloadMediaQueue.drain = undefined;
		finished();
            }
	}
    };
    downloadMediaQueue.push( '' );
}

function drainOptimizationQueue( finished ) {
    printLog( optimizationQueue.length() + ' images still to be optimized.' );
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
}

function saveRedirects( finished ) {
    printLog( 'Saving redirects...' );

    function callback( redirectId, finished ) {
	redisClient.hget( redisRedirectsDatabase, redirectId, function( error, target ) {
	    if ( error ) {
		console.error( 'Unable to get a redirect target from redis: ' + error );
		process.exit( 1 );
	    } else {
		if ( target ) {
		    var html = redirectTemplate( { title: redirectId.replace( /_/g, ' ' ), 
						   target : getArticleUrl( target ) } );
		    writeFile( html, getArticlePath( redirectId ), finished );
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
	    async.eachLimit( keys, maxParallelRequests, callback, function( error ) {
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
    printLog( 'Saving articles...' );

    function callback( articleId, finished ) {
	
	function parseHtml( html, articleId, finished) {
	    try {
		setTimeout( finished, 0, null, domino.createDocument( html ), articleId );
	    } catch ( error ) {
		console.error( 'Crash by parsing ' + articleId );
		console.error( error );
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
		     img.getAttribute( 'src' ) && img.getAttribute( 'src' ).indexOf( './Special:FilePath/' ) != 0
		   ) {

                    /* Remove image link */
                    var linkNode = img.parentNode;
                    if ( linkNode.tagName === 'A') {

			/* Check if the target is mirrored */
			var href = linkNode.getAttribute( 'href' );
			var keepLink =
			    href.indexOf( '/wiki/' ) != -1 || href.indexOf( './' ) != -1 ?
			    isMirrored( decodeURI( href.replace( /^(\/wiki\/|\.\/)/, '' ) ) ) : false;

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
                                downloadMediaQueue.push( src );
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
		var image = imageNode.getElementsByTagName( 'img' )[0];
		var isStillLinked = image && image.parentNode && image.parentNode.tagName === 'A';

		if ( !nopic && imageNode && image ) {
		    var imageNodeClass = imageNode.getAttribute( 'class' ) || '';
		    var imageNodeTypeof = imageNode.getAttribute( 'typeof' );
		    
		    if ( imageNodeTypeof.indexOf( 'mw:Image/Thumb' ) >= 0 ) {
			var description = imageNode.getElementsByTagName( 'figcaption' )[0];
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

	    setTimeout( finished, 0, null, parsoidDoc, articleId );
	}

	function rewriteUrls( parsoidDoc, articleId, finished ) {

	    /* Go through all links */
	    var as = parsoidDoc.getElementsByTagName( 'a' );
	    var areas = parsoidDoc.getElementsByTagName( 'area' );
	    var linkNodes = Array.prototype.slice.call( as ).concat( Array.prototype.slice.call( areas ) );

	    function rewriteUrl( linkNode, finished ) {
		var rel = linkNode.getAttribute( 'rel' );
		var href = linkNode.getAttribute( 'href' );

		if ( !href ) {
		    deleteNode( linkNode );
		    setTimeout( finished, 0 );
		} else {

		    /* Deal with custom geo. URL replacement, for example: 
		     * http://maps.wikivoyage-ev.org/w/poimap2.php?lat=44.5044943&lon=34.1969633&zoom=15&layer=M&lang=ru&name=%D0%9C%D0%B0%D1%81%D1%81%D0%B0%D0%BD%D0%B4%D1%80%D0%B0
		     * http://tools.wmflabs.org/geohack/geohack.php?language=fr&pagename=Tour_Eiffel&params=48.85825_N_2.2945_E_type:landmark_region:fr
		     */
		    if ( rel != 'mw:WikiLink' ) {
			var piomapUrlRegexp = new RegExp( '.*poimap2\.php.*', 'gi' );
			var match = piomapUrlRegexp.exec( href );
			if ( match ) {
			    var latRegexp = new RegExp( '.*lat=([\\d\\.]+).*', 'gi' );
			    match = latRegexp.exec( href );
			    var lat = match ? match[1] : undefined;
			    var lonRegexp = new RegExp( '.*lon=([\\d\\.]+).*', 'gi' );
			    match = lonRegexp.exec( href );
			    var lon = match ? match[1] : undefined;
			    if ( lat && lon ) {
				href = 'geo:' + lat + ',' + lon;
				linkNode.setAttribute( 'href', href );
			    }
			}
		    }

		    if ( rel ) {

			/* Add 'external' class to external links */
			if ( rel.substring( 0, 10 ) === 'mw:ExtLink' || 
			     rel === 'mw:WikiLink/Interwiki' ) {
			    linkNode.setAttribute( 'class', concatenateToAttribute( linkNode.getAttribute( 'class'), 'external' ) );
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
			    setTimeout( finished, 0 );
			}

			/* Remove internal links pointing to no mirrored articles */
			else if ( rel == 'mw:WikiLink' ) {
			    var targetId = decodeURI( href.replace( /^\.\//, '' ) );
			    if ( isMirrored( targetId ) ) {
				linkNode.setAttribute( 'href', getArticleUrl( targetId ) );
				setTimeout( finished, 0 );
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
					setTimeout( finished, 0 );
				    });
				} catch ( error ) {
				    console.error ( "Exception by requesting redis " + error );
				    process.exit( 1 );
				}
			    }
			}
		    } else {
			if ( href.indexOf( '/wiki/' ) != -1 || href.indexOf( './' ) != -1 ) {
			    var targetId = decodeURI( href.replace( /^(\/wiki\/|\.\/)/, '' ) );
			    if ( isMirrored( targetId ) ) {
				linkNode.setAttribute( 'href', getArticleUrl( targetId ) );
				setTimeout( finished, 0 );
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
				    setTimeout( finished, 0 );
				});
			    }
			} else {
			    setTimeout( finished, 0 );
			}
		    }
		}
	    }

	    async.eachLimit( linkNodes, maxParallelRequests, rewriteUrl, function( error ) {
		if ( error ) {
		    console.error( 'Problem by rewriting urls: ' + error );
		    process.exit( 1 );
		} else {
		    setTimeout( finished, downloadMediaQueue.length() + optimizationQueue.length(), null, parsoidDoc, articleId );
		}
	    });

	}
	
	function applyOtherTreatments( parsoidDoc, redirectId, finished ) {
	    
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
			span.parentNode.replaceChild(sup, span);
		    } else {
			deleteNode( span );
		    }
		}
	    }
	    
	    /* Remove element with id in the blacklist */
	    idBlackList.map( function( id ) {
		var node = parsoidDoc.getElementById( id );
		if (node) {
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
			deleteNode(nodes[i]);
		    }
		}
	    });
	    
	    /* Remove link tags */
	    var links = parsoidDoc.getElementsByTagName( 'link' );
	    for ( var i = 0; i < links.length ; i++ ) {
		deleteNode(links[i]);
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

	    setTimeout( finished, 0 , null, parsoidDoc, articleId );
	}

	function setFooter( parsoidDoc, articleId, finished ) {
	    /* Create final document by merging template and parsoid documents */
	    var doc = domino.createDocument( htmlTemplateCode );
	    doc.getElementById( 'mw-content-text' ).innerHTML = parsoidDoc.getElementsByTagName( 'body' )[0].innerHTML;
	    doc.getElementById( 'titleHeading' ).innerHTML = articleId.replace( /_/g, ' ' );
	    doc.getElementsByTagName( 'title' )[0].innerHTML = articleId.replace( /_/g, ' ' );

	    /* Set footer */
	    var div = doc.createElement( 'div' );
	    var oldId = articleIds[ articleId ];
	    redisClient.hget( redisArticleDetailsDatabase, articleId, function( error, timestamp ) {
		if ( error ) {
		    finished( 'Unable to get the timestamp from redis for article ' + articleId + ': ' + error );
		} else {
		    var date = new Date( timestamp );
		    div.innerHTML = footerTemplate({ articleId: encodeURIComponent( articleId ), webUrl: webUrl, name: name, oldId: oldId, date: date.toLocaleDateString("en-US") });
		    doc.getElementById( 'mw-content-text' ).appendChild( div );
		    setTimeout( finished, 0, null, doc, articleId );
		}
	    });
	}
	
	function writeArticle( doc, articleId, finished ) {
	    writeFile( doc.documentElement.outerHTML, getArticlePath( articleId ), function() { setTimeout( finished, 0, null ); } );
	}

	var articlePath = getArticlePath( articleId );
	var articleUrl = parsoidUrl + encodeURIComponent( articleId ) + '?oldid=' + articleIds[ articleId ];
	printLog( 'Downloading article from ' + articleUrl + ' at ' + articlePath + '...' );
	loadUrlAsync( articleUrl, function( html, articleId, revId ) {
	    if ( html ) {
		var prepareAndSaveArticle = async.compose( writeArticle, setFooter, applyOtherTreatments, rewriteUrls, treatMedias, parseHtml );
		prepareAndSaveArticle(html, articleId, function ( error, result ) {
		    if ( error ) {
			console.error( "Error by preparing and saving file " + error );
			process.exit( 1 );
		    } else {
			setTimeout( finished, 0 );
		    }
		});
	    } else {
		delete articleIds[ articleId ];
		setTimeout( finished, 0 );
	    }
	}, articleId);
    }

    async.eachLimit(Object.keys(articleIds), maxParallelRequests, callback, function( error ) {
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
    var namespaceNumber = 0;

    if ( id.indexOf(':') >= 0 ) {
	var tmpNamespaceNumber = namespaces[ id.substring( 0, id.indexOf(':') ).replace( / /g, '_') ];
	if ( tmpNamespaceNumber && tmpNamespaceNumber in namespaces ) {
	    return true;
	}
    }

    return ( id in articleIds );
}

/* Grab and concatenate javascript files */
function saveJavascript( finished ) {
    printLog( 'Creating javascript...' );
    
    jsdom.defaultDocumentFeatures = {
	FetchExternalResources   : ['script'],
	ProcessExternalResources : ['script'],
	MutationEvents           : '2.0',
    }

    loadUrlAsync( webUrl, function( html ) {
	
	html = html.replace( '<head>', '<head><base href="' + mwUrl + '" />');

	// Create a dummy JS file to be executed asynchronously in place of loader.php
	var dummyPath = htmlRootPath + javascriptDirectory + '/local.js';
	fs.writeFileSync(dummyPath, "printLog('mw.loader not supported');");
	
	// Backward compatibility for old version of jsdom
	var window;
	try {
	    window = jsdom.jsdom( html ).parentWindow;
	} catch ( error ) {
	    window = jsdom.jsdom( html ).createWindow();
	}
	
	window.addEventListener('load', function () {
	    var nodeNames = [ 'head', 'body' ];
	    nodeNames.map( function( nodeName ) {
		var node = window.document.getElementsByTagName( nodeName )[0];
		var scripts = node.getElementsByTagName( 'script' );
		var javascriptPath = htmlRootPath + javascriptDirectory + '/' + nodeName + '.js';
		
		fs.unlink( javascriptPath, function() {} );
		for ( var i = 0; i < scripts.length ; i++ ) {
		    var script = scripts[i];
		    var url = script.getAttribute( 'src' );
		    
		    var munge_js = function(txt) {
			txt = txt.replace(RegExp("//bits.wikimedia.org/.*.wikipedia.org/load.php", "g"), "../../../../../js/local.js");
			return txt;
		    }
		    
		    if ( url ) {
			url = getFullUrl( url ).replace("debug=false", "debug=true");
			printLog( 'Downloading javascript from ' + url );
			loadUrlAsync( url, function( body) {
			    fs.appendFile( javascriptPath, '\n' + munge_js(body) + '\n', function (err) {} );
			});
		    } else {
			fs.appendFile( javascriptPath, '\n' + munge_js(script.innerHTML) + '\n', function (err) {} );
		    }
		}
	    });
	});
	
	finished();

    });
}

/* Grab and concatenate stylesheet files */
function saveStylesheet( finished ) {
    printLog( 'Creating stylesheet...' );
    var stylePath = htmlRootPath + styleDirectory + '/style.css';
    fs.unlink( stylePath, function() {} );

    loadUrlAsync( webUrl, function( html ) {
	var doc = domino.createDocument( html );
	var links = doc.getElementsByTagName( 'link' );
	var cssUrlRegexp = new RegExp( 'url\\([\'"]{0,1}(.+?)[\'"]{0,1}\\)', 'gi' );
	var cssDataUrlRegex = new RegExp( '^data' );
	var urlCache = new Object();
	
	for ( var i = 0; i < links.length ; i++ ) {
	    var link = links[i];
	    if (link.getAttribute('rel') === 'stylesheet') {
		var url = link.getAttribute('href');

		/* Need a rewrite if url doesn't include protocol */
		url = getFullUrl( url );
		
		printLog( 'Downloading CSS from ' + decodeURI( url ) );
		loadUrlAsync( url, function( body ) {

		    /* Downloading CSS dependencies */
		    var match;
		    var rewrittenCss = body;
		    
		    while (match = cssUrlRegexp.exec( body ) ) {
			var url = match[1];
			
			/* Avoid 'data', so no url dependency */
			if ( ! url.match( '^data' ) ) {
			    var filename = pathParser.basename( urlParser.parse( url, false, true ).pathname );
			    
			    /* Rewrite the CSS */
			    rewrittenCss = rewrittenCss.replace( url, filename );
			    
			    /* Need a rewrite if url doesn't include protocol */
			    url = getFullUrl( url );
			    
			    /* Download CSS dependency, but avoid duplicate calls */
			    if ( !urlCache.hasOwnProperty( url ) ) {
				urlCache[url] = true;
				downloadFile( url, htmlRootPath + styleDirectory + '/' + filename );
			    }
			}
		    }
		    fs.appendFileSync( stylePath, rewrittenCss );
		});
	    }
	}

	finished();
    });
}

/* Get ids */
function getArticleIds( finished ) {

    /* Get redirect ids give an article id */
    var redirectQueue = async.queue( function ( articleId, finished ) {
	var url = apiUrl + 'action=query&list=backlinks&blfilterredir=redirects&bllimit=500&format=json&bltitle=' + encodeURIComponent( articleId );
	loadUrlAsync( url, function( body ) {
            printLog( 'Getting redirects for article ' + articleId + '...' );
	    try {
		if ( !JSON.parse( body )['error'] ) {
		    var entries;
		    entries = JSON.parse( body )['query']['backlinks'];
		    entries.map( function( entry ) {
			redisClient.hset( redisRedirectsDatabase, entry['title'].replace( / /g, '_' ), articleId );
		    });
		    finished();
		} else {
		    finished();
		}
	    } catch( error ) {
		console.error( error );
		finished( error );
	    }
	});
    }, maxParallelRequests);
    
    redirectQueue.drain = function( error ) {
	if ( error ) {
	    console.error( 'Unable to retrieve redirects for an article: ' + error );
            process.exit( 1 );
	}
    };
    
    function parseJson( body, finished ) {
	var articleIdsToGetRedirect = new Array();
	var entries = new Array();
	
	try {
	    entries = JSON.parse( body )['query']['pages'];
	    Object.keys( entries ).map( function( key ) {
		var entry = entries[key];
		entry['title'] = entry['title'].replace( / /g, '_' );
		if ( entry['revisions'] !== undefined ) {
		    articleIds[entry['title']] = entry['revisions'][0]['revid'];
		    redisClient.hset( redisArticleDetailsDatabase, entry['title'], entry['revisions'][0]['timestamp'] );
		    articleIdsToGetRedirect.push( entry['title'] );
		}
	    });

	    async.map( articleIdsToGetRedirect, redirectQueue.push, function( error ) {
		if ( error ) {
		    console.error( 'Unable to get all redirect ids for article: ' + error );
		    process.exit( 1 );
		} else {
		    var next = JSON.parse( body )['query-continue'] ? JSON.parse( body )['query-continue']['allpages']['gapcontinue'] : undefined;
		    finished( next );
		}
	    });
	} catch ( error ) {
	    console.error( 'Unable to parse JSON and redirects: '  + error );
	    var next = JSON.parse( body )['query-continue'] ? JSON.parse( body )['query-continue']['allpages']['gapcontinue'] : undefined;
	    finished( next );
	}
    }

    /* Get ids from file */
    function getArticleIdsForFile() {
	
	function getArticleIdsForLine( line, finished ) {
	    if ( line ) {
		var title = line.replace( / /g, '_' );
		var url = apiUrl + 'action=query&redirects&format=json&prop=revisions&titles=' + encodeURIComponent( title );
		loadUrlAsync( url, parseJson, function() { 
		    finished();
		});
	    } else {
                finished();
            }
	}

	var lines = fs.readFileSync( articleList ).toString().split( '\n' );
	async.eachLimit( lines, maxParallelRequests, getArticleIdsForLine, function( error ) {
	    if ( error ) {
		console.error( 'Unable to get all article ids for a file: ' + error );
		process.exit( 1 );
	    } else {
		console.error( 'List of article ids to mirror completed' );
		finished();
	    }
	});
    }
    
    function getArticleIdsForNamespaces() {

	function getArticleIdsForNamespace( namespace, finished ) {
	    var next = '';

	    var parseJsonQueue = async.queue( parseJson, maxParallelRequests);
	    parseJsonQueue.drain = function( error ) {
		if ( !next ) {
		    printLog( 'List of article ids to mirror completed for namespace "' +  namespace + '"' );
		    finished();
		}
	    };

	    async.doWhilst(
		function ( finished ) {
		    printLog( 'Getting article ids' + ( next ? ' (from ' + ( namespace ? namespace + ':' : '') + next  + ')' : '' ) + '...' );
		    var url = apiUrl + 'action=query&generator=allpages&gapfilterredir=nonredirects&gaplimit=500&prop=revisions&gapnamespace=' + namespaces[ namespace ] + '&format=json&gapcontinue=' + encodeURIComponent( next );
		    loadUrlAsync( url, function( body ) {
			next = JSON.parse( body )['query-continue'] ? JSON.parse( body )['query-continue']['allpages']['gapcontinue'] : undefined;
			parseJsonQueue.push( body );
			finished();
		    });
		},
		function () { return next; },
		function ( error ) {
		    if ( error ) {
			console.error( 'Unable to download article ids: ' + error );
			process.exit( 1 );
		    }
		}
	    );
	}

	async.eachLimit( namespacesToMirror, maxParallelRequests, getArticleIdsForNamespace, function( error ) {
	    if ( error ) {
		console.error( 'Unable to get all article ids for in a namespace: ' + error );
		process.exit( 1 );
	    } else {
		printLog( 'List of article ids to mirror completed' );
		finished();
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
    printLog( 'Creating directories at \'' + htmlRootPath + '\'...' );
    async.series(
        [
	    function( finished ) { rimraf( htmlRootPath, finished ) },
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
function getFullUrl( url ) {
    if ( ! urlParser.parse( url, false, true ).protocol ) {
	var protocol = urlParser.parse( url, false, true ).protocol || 'http:';
	var host = urlParser.parse( url, false, true ).host || urlParser.parse( webUrl ).host;
	var path = urlParser.parse( url, false, true ).path;
	url = protocol + '//' + host + path;
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

function writeFile( data, path, callback ) {
    printLog( 'Writing ' + path + '...' );
    
    if ( pathParser.dirname( path ).indexOf('./') >= 0 ) {
	console.error( 'Wrong path ' + path );
	process.exit( 1 );
    }

    var stream = fs.createWriteStream( path);
    stream.on( 'error', function( error ) {
	console.error( 'Unable to write data at ' + path + " - " + error );
	process.exit( 1 );
    });
    stream.once('open', function( fd ) {
	stream.write( data);
	stream.end();

	if (callback) {
	    callback();
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

function downloadMedia( url, callback ) {
    var parts = mediaRegex.exec( decodeURI( url ) );
    var filenameBase = (parts[2].length > parts[5].length ? parts[2] : parts[5] + parts[6] + ( parts[7] || '' ));
    var width = parseInt( parts[4].replace( /px\-/g, '' ) ) || 9999999;

    redisClient.hget( redisMediaIdsDatabase, filenameBase, function( error, r_width ) {
        if ( error || r_width < width) {
	    redisClient.hset( redisMediaIdsDatabase, filenameBase, width, function() {
		downloadFile( url, getMediaPath( url ), true, function( ok ) {
		    if ( callback ) {
			callback();
		    }
		});
	    });
        } else {
	    if ( callback ) {
		callback();
	    }
        }
    });
}

process.on( 'uncaughtException', function( error ) {
    console.trace( "NODEJS FATAL EXCEPTION:" + error );
    throw error;
    process.exit( 42 );
});


function downloadFile( url, path, force, callback ) {
    var data;

    fs.exists( path, function ( exists ) {
	if ( exists && !force ) {
	    printLog( path + ' already downloaded, download will be skipped.' );
	    if (callback) {
		callback();
	    }
	} else {
	    printLog( 'Downloading ' + decodeURI( url ) + ' at ' + path + '...' );
	    url = url.replace( /^https\:\/\//, 'http://' );

	    var tmpExt = '.' + randomString( 5 );
	    var tmpPath = path + tmpExt;
	    request.get( {url: url, timeout: 200000}, tmpPath, function( error, filename ) {
		if ( error ) {
		    fs.unlink( tmpPath, function() {
			console.error( 'Unable to download ' + decodeURI( url ) + ' ( ' + error + ' )' );
			if (callback) {
			    callback();
			}
		    })
		} else {
		    printLog( 'Successfuly downloaded ' + decodeURI( url ) + ' to ' + tmpPath );

		    async.retry( 5,		
				 function ( finished ) {
				     fs.stat( path, function ( error, stats ) {
					 if ( error ) {
					     fs.rename( tmpPath, path, function( error ) {
						 if ( error ) {
						     finished( 'Unable to move "' + tmpPath + '" to "' + path + '" (' + error + '), was a normal move after file download.' );
						 } else {
						     fs.stat( path, function ( error, stats ) {
							 if ( error ) {
							     setTimeout ( function() {
								 finished( 'Unable to stat "' + path + '" (' + error + '), was a normal move after file download.' );
							     }, 50000 );
							 } else {
							     optimizationQueue.push( {path: path, size: stats.size} );
							     finished();
							 }
						     });
						 }
					     });
					 } else {
					     var targetSize = stats.size;
					     fs.stat( tmpPath, function ( error, stats ) {
						 if ( error ) {
						     setTimeout ( function() {
							 finished( 'Unable to stat "' + tmpPath + '" (' + error + '), file was already downloaded and second download temporary file seems to be unavailable.' );
						     }, 50000 );
						 } else {
						     if ( stats.size > targetSize ) {
							 fs.rename( tmpPath, path, function( error ) {
							     if ( error ) {
								 setTimeout ( function() {
								     finished( 'Unable to move "' + tmpPath + '" to "' + path + '" (' + error + '), file was already downloaded but in a smaller version.' );
								 }, 50000 );
							     } else {
								 optimizationQueue.push( {path: path, size: stats.size} );
								 finished();
							     }
							 });
						     } else {
							 printLog( path + ' was meanwhile downloaded and with a better quality. Download skipped.' );
							 fs.unlink( tmpPath );
							 finished();
						     }
						 }
					     });
					 }
				     });
				 },
				 function ( error ) {
				     if ( error ) {
					 console.error( error );
					 process.exit( 1 );
				     } else {
					 if ( callback ) {
					     callback( true );
					 }
				     }
				 });
		}
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
        console.error( 'Unable to parse media url \'' + url + '\'' );
        return;
    }

    function e( string ) {
	return ( string === undefined ? undefined :
		 escape ? encodeURIComponent( string ) : string );
    }

    var filenameFirstVariant = parts[2];
    var filenameSecondVariant = parts[5] + parts[6] + ( parts[7] || '' );
    var filename = filenameFirstVariant.length > filenameSecondVariant.length ?
        filenameFirstVariant : filenameSecondVariant ;

    /* Need to shorten the file due to filesystem limitations */
    if ( unicodeCutter.getBinarySize( filename ) > 249 ) {
	var ext = pathParser.extname( filename ).split( '.' )[1] || '';
        var basename = filename.substring( 0, filename.length - ext.length - 1) || '';
	filename = unicodeCutter.truncateToBinarySize( basename, 239 - ext.length ) + crypto.createHash( 'md5' ).update( basename ).digest('hex').substring( 0, 2) + "." + ext;
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
    var dirBase = filename.replace( /\./g, '_');
    
    /* Filesystem is not able to handle with filename > 255 bytes */
    while ( Buffer.byteLength( filename, 'utf8') > 250 ) {
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
    loadUrlAsync( webUrl, function( html ) {
	var doc = domino.createDocument( html );
	var subTitleNode = doc.getElementById( 'siteSub' );
	subTitle = subTitleNode.innerHTML;
	finished();
    });
}

function getSiteInfo( finished ) {
    printLog( 'Getting web site name...' );
    var url = apiUrl + 'action=query&meta=siteinfo&format=json&siprop=general|namespaces|statistics|variables|category|wikidesc';
    loadUrlAsync( url, function( body ) {
	var entries = JSON.parse( body )['query']['general'];
	name = entries['sitename'];
	langIso2 = entries['lang'];
	countryLanguage.getLanguage( langIso2, function ( error, language ) {
	    if ( error ) {
		if ( langIso2.length == 3 ) {
		    langIso3 = langIso2;
		} else {
		    printLog( error );
		    process.exit( 1 );
		}
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
    
    loadUrlAsync( apiUrl + 'action=query&meta=siteinfo&format=json', function( body ) {	
	var entries = JSON.parse( body )['query']['general'];
	var logoUrl = entries['logo'];
	logoUrl = urlParser.parse( logoUrl ).protocol ? logoUrl : 'http:' + logoUrl;
	downloadFile( logoUrl, faviconPath, true, function() {
	    var cmd = 'convert -thumbnail 48 "' + faviconPath + '" "' + faviconPath + '.tmp" ; mv  "' + faviconPath + '.tmp" "' + faviconPath + '" ';
	    exec(cmd + ' 2>&1 > /dev/null', function( error, stdout, stderr ) {
		finished( error );
	    });
	});
    });
}

function getMainPage( finished ) {
    var path = htmlRootPath + '/index.html';
    
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
	writeFile( doc.documentElement.outerHTML, htmlRootPath + '/index.html', function() { setTimeout( finished, 0 ); } );
    }
    
    function retrieveMainPage( finished ) {
	printLog( 'Getting main page...' );
	loadUrlAsync( webUrl, function( body ) {
	    var titleRegex = /\"wgPageName\"\:\"(.*?)\"/;
	    var titleParts = titleRegex.exec( body );
	    if ( titleParts[ 1 ] ) {
		var html = redirectTemplate( { title:  titleParts[1].replace( /_/g, ' ' ), 
					       target : getArticleBase( titleParts[1], true ) } );
		writeFile( html, htmlRootPath + '/index.html' );
	    } else {
		console.error( 'Unable to get the main page' );
		process.exit( 1 );
	    };
	    finished();
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
    var body = loadUrlAsync( url, function( body ) { 
	var types = [ 'namespaces', 'namespacealiases' ];
	types.map( function( type ) {
	    var entries = JSON.parse( body )['query'][type];
	    Object.keys(entries).map( function( key ) {
		var entry = entries[key];
		var name = entry['*'].replace( / /g, '_');
		var number =  entry['id'];
		var isContent = entry['content'] != undefined ? true : false;
		var canonical = entry['canonical'] ? entry['canonical'].replace( / /g, '_' ) : '';

		/* Namespaces in local language */
		namespaces[ lcFirst( name ) ] = number;
		namespaces[ ucFirst( name ) ] = number;

		/* Namespaces in English (if available) */
		if ( canonical ) {
		    namespaces[ lcFirst( canonical ) ] = number;
		    namespaces[ ucFirst( canonical ) ] = number;
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
    var path = htmlRootPath + '/index.html';

    loadUrlAsync( webUrl, function( body ) {
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

function decodeURI( uri ) {
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