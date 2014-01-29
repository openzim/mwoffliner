#!/usr/bin/env node
"use strict";

/************************************/
/* CUSTOM VARIABLE SECTION **********/
/************************************/

/* TODO: Create category pages */
var withCategories = false;

/* Keep thumbnails in articles */
var withMedias = false;

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
var rootPath = 'static/';

/* Parsoid URL */
var parsoidUrl = 'http://parsoid-lb.eqiad.wikimedia.org/enwiki/';

/* Wikipedia/... URL */
var hostUrl = 'http://en.wikipedia.org/';

/* Namespaces to mirror */
var namespacesToMirror = [ '' ];

/* License footer template code */
var footerTemplateCode = '<div style="clear:both; background-image:linear-gradient(180deg, #E8E8E8, white); border-top: dashed 2px #AAAAAA; padding: 0.5em 0.5em 2em 0.5em; margin-top: 1em;">This article is issued from <a class="external text" href="{{ webUrl }}{{ articleId }}">{{ name }}</a>. The text is available under the <a class="external text" href="http://creativecommons.org/licenses/by-sa/3.0/">Creative Commons Attribution/Share Alike</a>; additional terms may apply for the media files.</div>';

/************************************/
/* CONSTANT VARIABLE SECTION ********/
/************************************/

var styleDirectory = 'style';
var htmlDirectory = 'html';
var mediaDirectory = 'media';
var javascriptDirectory = 'js';
var mediaRegex = /^(.*\/)([^\/]+)(\/)(\d+px-|)(.+?)(\.[A-Za-z0-9]{2,6})(\.[A-Za-z0-9]{2,6}|)$/;
var htmlTemplateCode = function(){/*
<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <title></title>
    <link rel="stylesheet" href="../../../../../style/style.css" />
    <script src="../../../../../js/head.js"></script>
  </head>
  <body class="mediawiki" style="background-color: white;">
    <div id="content" style="margin: 0px; border-width: 0px;">
      <a id="top"></a>
      <h1 id="firstHeading" class="firstHeading" style="margin-bottom: 0.5em; background-color: white;"></h1>
      <div id="ss" style="font-size: smaller; margin-top: -1em;"></div>
      <div id="bodyContent">
        <div id="mw-content-text" style="padding-top: 1em;">
        </div>
      </div>
    </div>
    <script src="../../../../../js/body.js"></script>
  </body>
</html>
*/}.toString().slice(14,-3);

/************************************/
/* SYSTEM VARIABLE SECTION **********/
/************************************/

var maxParallelRequests = 30;
var maxTryCount = 3;
var ltr = true;
var autoAlign = ltr ? 'left' : 'right';
var revAutoAlign = ltr ? 'right' : 'left';
var subTitle = 'From Wikipedia, the free encyclopedia';
var name = '';
var lang = 'en';
var articleIds = {};
var namespaces = {};
var mediaIds = {};
var webUrl = hostUrl + 'wiki/';
var apiUrl = hostUrl + 'w/api.php?';

/************************************/
/* MODULE VARIABLE SECTION **********/
/************************************/

var fs = require( 'fs' );
var domino = require( 'domino' );
var jsdom = require( 'jsdom' );
var async = require( 'async' );
var Sync = require('sync');
var http = require( 'follow-redirects' ).http;
var httpsync = require( 'httpsync' );
var swig = require( 'swig' );
var urlParser = require( 'url' );
var pathParser = require( 'path' );
var sleep = require( 'sleep' );
var pngquant = require( 'pngquant' );
var pngcrush = require( 'pngcrush' );
var jpegtran = require( 'jpegtran' );
var request = require( 'request-enhanced' );
var htmlminifier = require('html-minifier');
var hiredis = require("hiredis");
var redis = require("redis");

/************************************/
/* RUNNING CODE *********************/
/************************************/

/* Setup redis client */
var redisClient = redis.createClient("/tmp/redis.sock");
var redisRedirectsDatabase = Math.floor( ( Math.random() * 10000000 ) + 1 ) + "redirects";
redisClient.expire( redisRedirectsDatabase, 60 * 60 *24 * 30, function( error, result) {});

/* Compile templates */
var redirectTemplate = swig.compile( redirectTemplateCode );
var footerTemplate = swig.compile( footerTemplateCode );

/* Increase the number of allowed parallel requests */
http.globalAgent.maxSockets = maxParallelRequests;

/* Get content */
async.series([
    function( finished ) { startProcess( finished ) },
    function( finished ) { getTextDirection( finished ) },
    function( finished ) { getNamespaces( finished ) },
    function( finished ) { getMainPage( finished ) },
    function( finished ) { getSubTitle( finished ) },
    function( finished ) { getSiteInfo( finished ) },
    function( finished ) { getArticleIds( finished ) }, 
    function( finished ) { getRedirectIds( finished ) },
    function( finished ) { saveRedirects( finished ) },
    function( finished ) { saveArticles( finished ) },
    function( finished ) { endProcess( finished ) },
]);

/************************************/
/* FUNCTIONS ************************/
/************************************/

function startProcess( finished ) {
    createDirectories();
    saveJavascript();
    saveStylesheet();
    saveFavicon();
    finished();
}

function endProcess( finished ) {
    redisClient.flushdb( function( error, result) {});
    redisClient.quit();
    finished();
}

function saveRedirects( finished ) {
    console.info( 'Saving redirects...' );

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
		    console.log( 'All redirects were saved successfuly.' );
		    finished();
		}
	    });
	}
    });
}

function saveArticles( finished ) {
    console.info( 'Saving articles...' );

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

	function rewriteUrls( parsoidDoc, articleId, finished) {

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
			if ( href.indexOf( '/wiki/' ) != -1 ) {
			    var targetId = decodeURI( href.replace(/^\/wiki\//, '') );
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
		    setTimeout( finished, 0, null, parsoidDoc, articleId );
		}
	    });

	}
	
	function applyOtherTreatments( parsoidDoc, redirectId, finished ) {
	    
	    /* Go through gallerybox */
	    var galleryboxes = parsoidDoc.getElementsByClassName( 'gallerybox' );
	    for ( var i = 0; i < galleryboxes.length ; i++ ) {
		if ( ( ! galleryboxes[i].getElementsByClassName( 'thumb' ).length ) || ( ! withMedias ) ) {
		    deleteNode( galleryboxes[i] );
		}
	    }
	    
	    /* Remove "map" tags if necessary */
	    if ( !withMedias ) {
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
	    
	    /* Improve image frames */
	    var figures = parsoidDoc.getElementsByTagName( 'figure' );
	    var spans = parsoidDoc.querySelectorAll("span[typeof=mw:Image/Frameless]");
	    var imageNodes = Array.prototype.slice.call( figures ).concat( Array.prototype.slice.call( spans ) );
	    for ( var i = 0; i < imageNodes.length ; i++ ) {
		var imageNode = imageNodes[i];
		
		if ( withMedias ) {
		    var imageNodeClass = imageNode.getAttribute( 'class' ) || '';
		    var imageNodeTypeof = imageNode.getAttribute( 'typeof' );
		    var image = imageNode.getElementsByTagName( 'img' )[0];
		    var imageWidth = parseInt( image.getAttribute( 'width' ) );
		    
		    if ( imageNodeTypeof.indexOf( 'mw:Image/Thumb' ) >= 0 ) {
			var description = imageNode.getElementsByTagName( 'figcaption' )[0];
			
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
			
			thumbinnerDiv.appendChild( image );
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
			    div.setAttribute( 'class', concatenateToAttribute( div.getAttribute( 'class' ), ' center' ) );
			} else {
			    div.setAttribute( 'class', concatenateToAttribute( div.getAttribute( 'class' ), 'float' + revAutoAlign ) );
			}
			div.appendChild( image );
			imageNode.parentNode.replaceChild(div, imageNode);
		    }
		} else {
		    deleteNode( imageNode );
		}
	    }
	    
	    /* Clean/rewrite image tags */
	    var imgs = parsoidDoc.getElementsByTagName( 'img' );
	    for ( var i = 0; i < imgs.length ; i++ ) {
		var img = imgs[i];
		
		if ( withMedias || img.getAttribute( 'typeof' ) == 'mw:Extension/math' ) {
		    var src = getFullUrl( img.getAttribute( 'src' ) );
		    
		    /* Download image */
		    downloadMedia( src );
		    
		    /* Change image source attribute to point to the local image */
		    img.setAttribute( 'src', getMediaUrl( src ) );
		    
		    /* Remove useless 'resource' attribute */
		    img.removeAttribute( 'resource' ); 
		    
		    /* Remove image link */
		    var linkNode = img.parentNode;
		    if ( linkNode.tagName === 'A') {
			
			/* Under certain condition it seems that this is possible
			 * to have parentNode == undefined, in this case this
			 * seems preferable to remove the whole link+content than
			 * keeping a wrong link. See for example this url
			 * http://parsoid.wmflabs.org/ko/%EC%9D%B4%ED%9C%98%EC%86%8C */
			
			if ( linkNode.parentNode ) {
			    linkNode.parentNode.replaceChild( img, linkNode );
			} else {
			    deleteNode( img );
			}
		    }
		} else {
		    deleteNode( img );
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

	    finished( null, parsoidDoc, articleId );
	}

	function writeArticle( parsoidDoc, articleId, finished ) {
	    /* Create final document by merging template and parsoid documents */
	    var doc = domino.createDocument( htmlTemplateCode );
	    doc.getElementById( 'mw-content-text' ).innerHTML = parsoidDoc.getElementsByTagName( 'body' )[0].innerHTML;
	    doc.getElementById( 'firstHeading' ).innerHTML = articleId.replace( /_/g, ' ' );
	    doc.getElementsByTagName( 'title' )[0].innerHTML = articleId.replace( /_/g, ' ' );
	    
	    /* Set sub-title */
	    doc.getElementById( 'ss' ).innerHTML = subTitle;
	    
	    /* Append footer node */
	    doc.getElementById( 'mw-content-text' ).appendChild( getFooterNode( doc, articleId ) );
	    
	    /* Write the static html file */
	    writeFile( doc.documentElement.outerHTML, getArticlePath( articleId ), function() { setTimeout( finished, 0, null ); } );
	}

	var articlePath = getArticlePath( articleId );
	fs.exists( articlePath, function (exists) {
	    if ( exists ) {
		console.info( articleId + ' already downloaded at ' + articlePath );
		finished();
	    } else {
		var articleUrl = parsoidUrl + encodeURIComponent( articleId ) + '?oldid=' + articleIds[ articleId ];
		console.info( 'Downloading article from ' + articleUrl + ' at ' + articlePath + '...' );
		loadUrlAsync( articleUrl, function( html, articleId, revId ) {
		    if ( html ) {
			var prepareAndSaveArticle = async.compose( writeArticle, applyOtherTreatments, rewriteUrls, parseHtml );
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
	});
    }

    async.eachLimit(Object.keys(articleIds), maxParallelRequests, callback, function( error ) {
	if ( error ) {
	    console.log( 'Unable to retrieve an article correctly: ' + error );
	    process.exit( 1 );
	} else {
	    console.log( 'All articles were retrieved and saved.' );
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
function saveJavascript() {
    console.info( 'Creating javascript...' );
    
    jsdom.defaultDocumentFeatures = {
	FetchExternalResources   : ['script'],
	ProcessExternalResources : ['script'],
	MutationEvents           : '2.0',
    }

    var html = loadUrlSync( webUrl );
    html = html.replace( '<head>', '<head><base href="' + hostUrl + '" />');
    var window = jsdom.jsdom( html ).createWindow();
    
    window.addEventListener('load', function () {
      var nodeNames = [ 'head', 'body' ];
      nodeNames.map( function( nodeName ) {
        var node = window.document.getElementsByTagName( nodeName )[0];
	var scripts = node.getElementsByTagName( 'script' );
	var javascriptPath = rootPath + javascriptDirectory + '/' + nodeName + '.js';
	
	fs.unlink( javascriptPath, function() {} );
	for ( var i = 0; i < scripts.length ; i++ ) {
	  var script = scripts[i];
	  var url = script.getAttribute( 'src' );
	  
	  if ( url ) {
	    url = getFullUrl( url );
	    console.info( 'Downloading javascript from ' + url );
	    // var body = loadUrlSync( url ).replace( '"//', '"http://' );
	    var body = loadUrlSync( url );
	    
	    fs.appendFile( javascriptPath, '\n' + body + '\n', function (err) {} );
	  } else {
	      fs.appendFile( javascriptPath, '\n' + script.innerHTML + '\n', function (err) {} );
	  }
	}
    });
   });
}

/* Grab and concatenate stylesheet files */
function saveStylesheet() {
    console.info( 'Creating stylesheet...' );
    var stylePath = rootPath + styleDirectory + '/style.css';
    fs.unlink( stylePath, function() {} );
    loadUrlSync( webUrl, function( html ) {
	var doc = domino.createDocument( html );
	var links = doc.getElementsByTagName( 'link' );
	var cssUrlRegexp = new RegExp( 'url\\([\'"]{0,1}(.+?)[\'"]{0,1}\\)', 'gi' );
	var cssDataUrlRegex = new RegExp( '^data' );
	
	for ( var i = 0; i < links.length ; i++ ) {
	    var link = links[i];
	    if (link.getAttribute('rel') === 'stylesheet') {
		var url = link.getAttribute('href');

		/* Need a rewrite if url doesn't include protocol */
		url = getFullUrl( url );
		
		console.info( 'Downloading CSS from ' + decodeURI( url ) );
		loadUrlSync( url, function( body ) {

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
			    
			    /* Download CSS dependency */
			    downloadFile(url, rootPath + styleDirectory + '/' +filename );
			}
		    }
		    fs.appendFileSync( stylePath, rewrittenCss );
		});
	    }
	}
    });
}

/* Get ids */
function getArticleIds( finished ) {
    namespacesToMirror.map( function( namespace ) {
	var next = "";

	do {
	    console.info( 'Getting article ids' + ( next ? ' (from ' + ( namespace ? namespace + ':' : '') + next  + ')' : '' ) + '...' );
	    var url = apiUrl + 'action=query&generator=allpages&gapfilterredir=nonredirects&gaplimit=500&prop=revisions&gapnamespace=' + namespaces[ namespace ] + '&format=json&gapcontinue=' + encodeURIComponent( next );
	    var body = loadUrlSync( url );
	    var entries = JSON.parse( body )['query']['pages'];
	    Object.keys( entries ).map( function( key ) {
		var entry = entries[key];
		articleIds[entry['title'].replace( / /g, '_' )] = entry['revisions'][0]['revid'];
	    });
	    next = JSON.parse( body )['query-continue'] ? JSON.parse( body )['query-continue']['allpages']['gapcontinue'] : undefined;
	} while ( next );
    });

    finished();
}

function getRedirectIds( finished ) {
    console.log( 'Getting redirect ids...' );

    function callback( articleId, finished ) { 
	var url = apiUrl + 'action=query&list=backlinks&blfilterredir=redirects&bllimit=500&format=json&bltitle=' + encodeURIComponent( articleId );
	loadUrlAsync( url, function( body, articleId ) {
            console.info( 'Getting redirects for article ' + articleId + '...' );
	    try {
		var entries;
		entries = JSON.parse( body )['query']['backlinks'];
		entries.map( function( entry ) {
		    redisClient.hset( redisRedirectsDatabase, entry['title'].replace( / /g, '_' ), articleId );
		});
		finished();
	    } catch( error ) {
		finished( error );
	    }
	}, articleId);
    }

    async.eachLimit( Object.keys(articleIds), maxParallelRequests, callback, function( error ) {
	if ( error ) {
            console.error( 'Unable to get redirects for an article: ' + error );
	    process.exit( 1 );
	} else {
	    console.log( 'All redirects were retrieved successfuly.' );
	    finished();
	}
    });
}

/* Create directories for static files */
function createDirectories() {
    console.info( 'Creating directories at \'' + rootPath + '\'...' );
    createDirectory( rootPath );
    createDirectory( rootPath + styleDirectory );
    createDirectory( rootPath + htmlDirectory );
    createDirectory( rootPath + mediaDirectory );
    createDirectory( rootPath + javascriptDirectory );
}

function createDirectory( path ) {
    try {
	fs.mkdirSync( path );
    } catch ( error ) {
	fs.exists( path, function ( exists ) {
	    if ( ! ( exists && fs.lstatSync( path ).isDirectory() ) ) {
		console.error( 'Unable to create directory \'' + path + '\'' );
		process.exit( 1 );
	    }
	});
    }
}
    
function createDirectoryRecursively( path, position ) {
    position = position || 0;
    var parts = pathParser.normalize( path ).split( '/' );
 
    if ( position >= parts.length ) {
	return true;
    }
 
    createDirectory( parts.slice( 0, position + 1 ).join( '/' ) );
    createDirectoryRecursively( path, position + 1 );
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
}

function concatenateToAttribute( old, add ) {
    return old ? old + ' ' + add : add;
}

function getFooterNode( doc, articleId ) {
    var div = doc.createElement( 'div' );
    div.innerHTML = footerTemplate({ articleId: encodeURIComponent( articleId ), webUrl: webUrl, name: name });
    return div;
}

function writeFile( data, path, callback ) {
    console.info( 'Writing ' + path + '...' );
    
    if ( pathParser.dirname( path ).indexOf('./') >= 0 ) {
	console.error( 'Wrong path ' + path );
	process.exit( 1 );
    }

    createDirectoryRecursively( pathParser.dirname( path ) );

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

function loadUrlSync( url, callback ) {
    var tryCount = 0;

    do {
	try {
	    var req = httpsync.get({ url : url });
	    var res = req.end();
	    var content = res.data.toString('utf8');

	    if ( res.headers.location ) {
		console.info( "Redirect detected, load " + decodeURI( res.headers.location ) );
		return loadUrlSync( res.headers.location, callback );
	    } else {
		if ( callback ) {
		    callback( content );
		    break;
		} else {
		    return content;
		}
	    }
	} catch ( error ) {
	    console.error( 'Unable to sync retrieve (try nb ' + tryCount++ + ') ' + decodeURI( url ) + ' ( ' + error + ' )');
	    if ( maxTryCount && tryCount > maxTryCount ) {
		console.error( 'Unable to get ' + decodeURI( url ) + ' and abandon.' );
		return "";
	    } else {
		console.error( 'Sleeping for ' + tryCount + ' seconds' );
		sleep.sleep( tryCount );
	    }
	}
    } while ( true );
}

function loadUrlAsync( url, callback, var1, var2, var3 ) {
    var tryCount = 0;
    var data;

    async.whilst(
	function() {
	    return ( maxTryCount == 0 || tryCount++ < maxTryCount );
	},
	function( finished ) {
	    request.get( {url: url , timeout: 60000} , function( error, body ) {
		if ( error ) {
		    console.error( 'Unable to async retrieve (try nb ' + tryCount + ') ' + decodeURI( url ) + ' ( ' + error + ' )');
		    console.info( 'Sleeping for ' + tryCount + ' seconds and they retry.' );
		    sleep.sleep( tryCount );
		    finished();
		} else {
		    data = body;
		    finished('ok');
		}
	    });
	},
	function( error ) {
	    if ( !data ) {
		console.error( 'Abandon retrieving of ' + decodeURI( url ) );
	    }
	    callback( data, var1, var2, var3 );
	}
    );
}

function downloadMedia( url ) {
    var parts = mediaRegex.exec( decodeURI( url ) );
    var filenameBase = (parts[2].length > parts[5].length ? parts[2] : parts[5] + parts[6] + ( parts[7] || '' ));
    var width = parseInt( parts[4].replace( /px\-/g, '' ) ) || 9999999;

    if ( mediaIds[ filenameBase ] && mediaIds[ filenameBase ] >=  width ) {
	return;
    } else {
	mediaIds[ filenameBase ] = width;
    }

    downloadFile( url, getMediaPath( url ), true );
}

process.on( 'uncaughtException', function( error ) {
    console.trace( "NODEJS FATAL EXCEPTION:" + error );
    throw error;
    process.exit( 42 );
});


function downloadFile( url, path, force ) {
    var data;
    var tryCount = 0;

    fs.exists( path, function ( exists ) {
	if ( exists && !force ) {
	    console.info( path + ' already downloaded, download will be skipped.' );
	} else {
	    console.info( 'Downloading ' + decodeURI( url ) + ' at ' + path + '...' );
	    url = url.replace( /^https\:\/\//, 'http://' );
	    
	    createDirectoryRecursively( pathParser.dirname( path ) );

	    async.whilst(
		function() {
		    return ( tryCount++ < maxTryCount );
		},
		function( finished ) {
		    request.get( {url: url , timeout: 60000}, path, function( error, filename ) {
			if ( error ) {
			    console.error( 'Unable to download (try nb ' + tryCount + ') from ' + decodeURI( url ) + ' ( ' + error + ' )');
			    if ( maxTryCount == 0 || tryCount < maxTryCount ) {
				console.info( 'Sleeping for ' + tryCount + ' seconds and they retry.' );
				sleep.sleep( tryCount );
				error = undefined;
			    }
			} else {
			    tryCount = maxTryCount;
			}
			finished( error );
		    });
		},
		function( error ) {
		    if ( error ) {
			console.error( 'Abandon retrieving of ' + decodeURI( url ) );
		    }
		}
	    );
	}
    });
}

/* Internal path/url functions */
function getMediaUrl( url ) {
    return '../../../../../' + getMediaBase( url, true );
}

function getMediaPath( url, escape ) {
    return rootPath + getMediaBase( url, escape );
}

function getMediaBase( url, escape ) {
    var parts = mediaRegex.exec( decodeURI( url ) );
    var root = parts[2].length > parts[5].length ? parts[2] : parts[5];

    if ( !root ) {
	console.error( 'Unable to parse filename \'' + filename + '\'' );
	process.exit( 1 );
    }

    function e( string ) {
	return ( string === undefined ? undefined :
		 escape ? encodeURIComponent( string ) : string );
    }

    var filenameFirstVariant = parts[2];
    var filenameSecondVariant = parts[5] + parts[6] + ( parts[7] || '' );

    return mediaDirectory + '/' + ( e( charAt( root, 0 ) ) || '_' ) + '/' + ( e( charAt( root, 1 ) ) || '_' ) + '/' + 
	( e( charAt( root, 2 ) ) || '_' ) + '/' + ( e( charAt( root, 3 ) ) || '_' ) + '/' + e( filenameFirstVariant.length > filenameSecondVariant.length ? 
 											       filenameFirstVariant : filenameSecondVariant );
}

function getArticleUrl( articleId ) {
    return '../../../../../' + getArticleBase( articleId, true );
}

function getArticlePath( articleId, escape ) {
    return rootPath + getArticleBase( articleId, escape );
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

    return htmlDirectory + '/' + ( e( charAt( dirBase, 0 ) ) || '_' ) + '/' + ( e( charAt( dirBase, 1 ) ) || '_' ) + '/' + 
	( e( charAt( dirBase, 2 ) ) || '_' ) + '/' + ( e( charAt( dirBase, 3 ) ) || '_' ) + '/' + e( filename ) + '.html';
}

function getSubTitle( finished ) {
    console.info( 'Getting sub-title...' );
    loadUrlSync( webUrl, function( html ) {
	var doc = domino.createDocument( html );
	var subTitleNode = doc.getElementById( 'siteSub' );
	subTitle = subTitleNode.innerHTML;
	finished();
    });
}

function getSiteInfo( finished ) {
    console.info( 'Getting web site name...' );
    var url = apiUrl + 'action=query&meta=siteinfo&format=json';
    loadUrlSync( url, function( body ) {
	var entries = JSON.parse( body )['query']['general'];
	name = entries['sitename'];
	lang = entries['lang'];
	finished();
    });
}

function saveFavicon() {
    console.info( 'Saving favicon.png...' );
    downloadFile( 'http://sourceforge.net/p/kiwix/tools/ci/master/tree/dumping_tools/data/wikipedia-icon-48x48.png?format=raw', rootPath + mediaDirectory + '/favicon.png' );
}

function getMainPage( finished ) {
    console.info( 'Getting main page...' );
    var path = rootPath + htmlDirectory + '/index.html';
    loadUrlSync( webUrl, function( body ) {
	var mainPageRegex = /\"wgPageName\"\:\"(.*?)\"/;
	var parts = mainPageRegex.exec( body );
	if ( parts[ 1 ] ) {
	    var html = redirectTemplate( { title:  parts[1].replace( /_/g, ' ' ), 
					   target : '../' + getArticleBase( parts[1], true ) } );
	    writeFile( html, rootPath + htmlDirectory + '/index.html' );
	    articleIds[ parts[ 1 ] ] = '';
	} else {
	    console.error( 'Unable to get the main page' );
	    process.exit( 1 );
	};
	finished();
    });
}

function getNamespaces( finished ) {
    var url = apiUrl + 'action=query&meta=siteinfo&siprop=namespaces|namespacealiases&format=json';
    var body = loadUrlSync( url );
    var types = [ 'namespaces', 'namespacealiases' ];
    types.map( function( type ) {
	var entries = JSON.parse( body )['query'][type];
	Object.keys(entries).map( function( key ) {
	    var entry = entries[key];
	    var name = entry['*'].replace( / /g, '_');
	    if ( name ) {
		var number =  entry['id'];
		namespaces[ lcFirst( name ) ] = number;
		namespaces[ ucFirst( name ) ] = number;
		
		var canonical = entry['canonical'] ? entry['canonical'].replace( / /g, '_' ) : '';
		if ( canonical ) {
		    namespaces[ lcFirst( canonical ) ] = number;
		    namespaces[ ucFirst( canonical ) ] = number;
		}
	    };
	});
    });
    namespaces[ '' ] = 0;

    finished();
}

function getTextDirection( finished ) {
    console.info( 'Getting text direction...' );
    var path = rootPath + htmlDirectory + '/index.html';
    loadUrlSync( webUrl, function( body ) {
	var languageDirectionRegex = /\"pageLanguageDir\"\:\"(.*?)\"/;
	var parts = languageDirectionRegex.exec( body );
	if ( parts && parts[ 1 ] ) {
	    ltr = ( parts[ 1 ] === 'ltr' );
	} else {
	    console.log( 'Unable to get the language direction, fallback to ltr' );
	    ltr = true;
	};
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