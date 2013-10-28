#!/usr/bin/env node
"use strict";

/************************************/
/* CUSTOM VARIABLE SECTION **********/
/************************************/

/* TODO: Create category pages */
var withCategories = false;

/* Keep thumbnails in articles */
var withMedias = true;

/* Template code for any redirect to be written on the FS */
var redirectTemplateCode = '<html><head><meta charset="UTF-8" /><title>{{ title }}</title><meta http-equiv="refresh" content="0; URL={{ target }}"></head><body></body></html>';

/* All DOM nodes with on of these styles will be removed */
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
var parsoidUrl = 'http://parsoid.wmflabs.org/fa/';

/* Wikipedia/... URL */
var hostUrl = 'http://fa.wikipedia.org/';

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
var mediaRegex = /^(\d+px-|)(.+?)(\.[A-Za-z0-9]{2,6})(\.[A-Za-z0-9]{2,6}|)$/;
var templateHtml = function(){/*
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

var maxParallelRequests = 16;
var maxTryCount = 0;
var tryCount = {};
var ltr = true;
var autoAlign = ltr ? 'left' : 'right';
var revAutoAlign = ltr ? 'right' : 'left';
var subTitle = 'From Wikipedia, the free encyclopedia';
var name = '';
var lang = 'en';
var articleIds = {};
var namespaces = {};
var redirectIds = {};
var mediaIds = {};
var webUrl = hostUrl + 'wiki/';
var apiUrl = hostUrl + 'w/api.php?';
var getRedirectIdsCount = 0;
var getRedirectIdsFinished;

/************************************/
/* MODULE VARIABLE SECTION **********/
/************************************/

var fs = require( 'fs' );
var domino = require( 'domino' );
var jsdom = require( 'jsdom' );
var async = require( 'async' );
var http = require( 'follow-redirects' ).http;
var httpsync = require( 'httpsync' );
var swig = require( 'swig' );
var urlParser = require( 'url' );
var pathParser = require( 'path' );
var sleep = require( 'sleep' );
var pngquant = require( 'pngquant' );
var pngcrush = require( 'pngcrush' );
var jpegtran = require( 'jpegtran' );
var htmlminifier = require('html-minifier');
var smooth = require('smooth')(maxParallelRequests);

/************************************/
/* RUNNING CODE *********************/
/************************************/

/* Compile redirect template */
var redirectTemplate = swig.compile( redirectTemplateCode );

/* Increase the number of allowed parallel requests */
http.globalAgent.maxSockets = maxParallelRequests;

/* Initialization */
createDirectories();
saveJavascript();
saveStylesheet();
saveFavicon();

/* Get content */
async.series([
    function( finished ) { getTextDirection( finished ) },
    function( finished ) { getNamespaces( finished ) },
    function( finished ) { getMainPage( finished ) },
    function( finished ) { getSubTitle( finished ) },
    function( finished ) { getSiteInfo( finished ) },
    function( finished ) { getArticleIds( finished ) }, 
    function( finished ) { getRedirectIds( finished ) },
    function( finished ) { saveArticles( finished ) },
    function( finished ) { saveRedirects( finished ) }
]);

/************************************/
/* FUNCTIONS ************************/
/************************************/

function saveRedirects( finished ) {
    console.info( 'Saving redirects...' );

    function callback( redirectId, finished ) {
	var html = redirectTemplate( { title: redirectId.replace( /_/g, ' ' ), 
				       target : getArticleUrl( redirectIds[ redirectId ] ) } );
	writeFile( html, getArticlePath( redirectId ), finished );
    }

    async.eachLimit( Object.keys( redirectIds ), maxParallelRequests, callback, function( err ) {
	if (err) {
	    console.error( 'Error in saveRedirects callback: ' + err );
	}
    });

    finished();
}

function saveArticles( finished ) {
    console.info( 'Saving articles...' );

    function callback( articleId, finished ) {
	var articlePath = getArticlePath( articleId );
	fs.exists( articlePath, function (exists) {
	    if ( exists ) {
		console.info( articleId + ' already downloaded at ' + articlePath );
		finished();
	    } else {
		var articleUrl = parsoidUrl + articleId;
		console.info( 'Downloading article from ' + articleUrl + ' at ' + articlePath + '...' );
		loadUrlAsync( articleUrl, function( html, articleId ) {
		    saveArticle( html, articleId );
		    finished();
		}, articleId);
	    }
	});
    }

    async.eachLimit(Object.keys(articleIds), maxParallelRequests, callback, function( err ) {
	if (err) {
	    console.error( 'Error in saveArticles callback: ' + err );
	}
    });

    finished();
}

function saveArticle( html, articleId ) {
    console.info( 'Parsing HTML/RDF of ' + articleId + '...' );
    
    /* For some reasons this code crash randomly */
    try {
	var parsoidDoc = domino.createDocument( html );

	/* Go through gallerybox */
	var galleryboxes = parsoidDoc.getElementsByClassName( 'gallerybox' );
	for ( var i = 0; i < galleryboxes.length ; i++ ) {
	    if ( ( ! galleryboxes[i].getElementsByClassName( 'thumb' ).length ) || ( ! withMedias ) ) {
		deleteNode( galleryboxes[i] );
	    }
	}
	
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
	}
	
	/* Go through all links (a tag) */
	var as = parsoidDoc.getElementsByTagName( 'a' );
	for ( var i = 0; i < as.length ; i++ ) {
	    var a = as[i];
	    var rel = a.getAttribute( 'rel' );
	    var href = a.getAttribute( 'href' );
	    
	    if ( !href ) {
		deleteNode( a );
		continue;
	    }
	    
	    if ( rel ) {
		/* Add 'external' class to external links */
		if ( rel.substring( 0, 10 ) === 'mw:ExtLink' || 
		     rel === 'mw:WikiLink/Interwiki' ) {
		    a.setAttribute( 'class', concatenateToAttribute( a.getAttribute( 'class'), 'external' ) );
		}
		
		/* Check if the link is "valid" */
		if ( ! href ) {
		    console.error( 'No href attribute in the following code, in article ' + articleId );
		    console.error( a.outerHTML );
		    process.exit(1);
		}
		
		/* Rewrite external links starting with // */
		if ( rel.substring( 0, 10 ) === 'mw:ExtLink' ) {
		    if ( href.substring( 0, 1 ) === '/' ) {
			a.setAttribute( 'href', getFullUrl( href ) );
		    }
		}
		
		/* Remove internal links pointing to no mirrored articles */
		else if ( rel == 'mw:WikiLink' ) {
		    var targetId = decodeURI( href.replace( /^\.\//, '' ) );
		    if ( isMirrored( targetId ) ) {
			a.setAttribute( 'href', getArticleUrl( targetId ) );
		    } else {
			while ( a.firstChild ) {
			    a.parentNode.insertBefore( a.firstChild, a);
			}
			a.parentNode.removeChild( a );
		    }
		}
	    } else {
		if ( href.indexOf( '/wiki/' ) != -1 ) {
		    var targetId = decodeURI( href.replace(/^\/wiki\//, '') );
		    if ( isMirrored( targetId ) ) {
			a.setAttribute( 'href', getArticleUrl( targetId ) );
		    } else {
			while ( a.firstChild ) {
			    a.parentNode.insertBefore( a.firstChild, a);
			}
			a.parentNode.removeChild( a );
		    }
		}
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
	
	/* Rewrite thumbnails */
	var figures = parsoidDoc.getElementsByTagName( 'figure' );
	for ( var i = 0; i < figures.length ; i++ ) {
	    var figure = figures[i];
	    
	    if ( withMedias ) {
		var figureClass = figure.getAttribute( 'class' ) || '';
		var figureTypeof = figure.getAttribute( 'typeof' );
		var image = figure.getElementsByTagName( 'img' )[0];
		var imageWidth = parseInt( image.getAttribute( 'width' ) );
		
		if ( figureTypeof.indexOf( 'mw:Image/Thumb' ) >= 0 ) {
		    var description = figure.getElementsByTagName( 'figcaption' )[0];
		    
		    var thumbDiv = parsoidDoc.createElement( 'div' );
		    thumbDiv.setAttribute
		    thumbDiv.setAttribute( 'class', 'thumb' );
		    if ( figureClass.search( 'mw-halign-right' ) >= 0 ) {
			thumbDiv.setAttribute( 'class', concatenateToAttribute( thumbDiv.getAttribute( 'class' ), 'tright' ) );
		    } else if ( figureClass.search( 'mw-halign-left' ) >= 0 ) {
			thumbDiv.setAttribute( 'class', concatenateToAttribute( thumbDiv.getAttribute( 'class' ), 'tleft' ) );
		    } else if ( figureClass.search( 'mw-halign-center' ) >= 0 ) {
			thumbDiv.setAttribute( 'class', concatenateToAttribute( thumbDiv.getAttribute( 'class' ), 'tnone center' ) );
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
		    
		    figure.parentNode.replaceChild(thumbDiv, figure);
		} else if ( figureTypeof.indexOf( 'mw:Image' ) >= 0 ) {
		    var div = parsoidDoc.createElement( 'div' );
		    if ( figureClass.search( 'mw-halign-right' ) >= 0 ) {
			div.setAttribute( 'class', concatenateToAttribute( div.getAttribute( 'class' ), 'floatright' ) );
		    } else if ( figureClass.search( 'mw-halign-left' ) >= 0 ) {
			div.setAttribute( 'class', concatenateToAttribute( div.getAttribute( 'class' ), 'floatleft' ) );
		    } else if ( figureClass.search( 'mw-halign-center' ) >= 0 ) {
			div.setAttribute( 'class', concatenateToAttribute( div.getAttribute( 'class' ), ' center' ) );
		    } else {
			div.setAttribute( 'class', concatenateToAttribute( div.getAttribute( 'class' ), 'float' + revAutoAlign ) );
		    }
		    div.appendChild( image );
		    figure.parentNode.replaceChild(div, figure);
		}
	    } else {
		deleteNode( figure );
	    }
	}
	
	/* Go through all images */
	var imgs = parsoidDoc.getElementsByTagName( 'img' );
	for ( var i = 0; i < imgs.length ; i++ ) {
	    var img = imgs[i];
	    
	    if ( withMedias ) {
		console.log( img.outerHTML );
		console.log( img.getAttribute( 'src')  );
		var src = getFullUrl( img.getAttribute( 'src' ) );
		var filename = decodeURI( pathParser.basename( urlParser.parse( src ).pathname ) );
		
		/* Download image */
		downloadMedia( src, filename );
		
		/* Change image source attribute to point to the local image */
		img.setAttribute( 'src', getMediaUrl( filename ) );
		
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
	
	/* Create final document by merging template and parsoid documents */
	var doc = domino.createDocument( templateHtml );
	var contentNode = doc.getElementById( 'mw-content-text' );
	contentNode.innerHTML = parsoidDoc.getElementsByTagName( 'body' )[0].innerHTML;
	var contentTitleNode = doc.getElementById( 'firstHeading' );
	contentTitleNode.innerHTML = articleId.replace( /_/g, ' ' );
	var titleNode = doc.getElementsByTagName( 'title' )[0];
	titleNode.innerHTML = articleId.replace( /_/g, ' ' );
	
	/* Clean the DOM of all uncessary code */
	var allNodes = doc.getElementsByTagName( '*' );
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
	
	/* Set sub-title */
	doc.getElementById( 'ss' ).innerHTML = subTitle;
	
	/* Append footer node */
	doc.getElementById( 'mw-content-text' ).appendChild( getFooterNode( doc, articleId ) );
	
	/* Minify HTML code */
	var html;
	try {
	    html = htmlminifier.minify( doc.documentElement.outerHTML, {
		removeComments: true,
		removeCommentsFromCDATA: true,
		collapseWhitespace: true,
		collapseBooleanAttributes: true,
		removeAttributeQuotes: true,
		removeEmptyAttributes: true });
	} catch ( error ) {
	    html = doc.documentElement.outerHTML;
	}

	/* Write the static html file */
	writeFile( html, getArticlePath( articleId ) );
    } catch ( error ) {
	console.error( 'Crash by parsing ' + articleId );
	console.error( error );
	console.error( 'Sleeping for 10 seconds' );
	sleep.sleep( 10 );
	loadUrlAsync( getArticleUrl( articleId ), function( html, articleId ) {
	    saveArticle( html, articleId );
	}, articleId);
    }
}

function isMirrored( id ) {
    var namespaceNumber = 0;

    if ( id.indexOf(':') >= 0 ) {
	var tmpNamespace = id.substring( 0, id.indexOf(':') ).replace( / /g, '_');
	var tmpNamespaceNumber = namespaces[tmpNamespace];
	if ( tmpNamespaceNumber && tmpNamespaceNumber in namespaces ) {
	    return true;
	}
    }
    
    return ( id in articleIds || id in redirectIds );
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
	    var url = apiUrl + 'action=query&generator=allpages&gapfilterredir=nonredirects&gaplimit=500&gapnamespace=' + namespaces[ namespace ] + '&format=json&gapcontinue=' + encodeURIComponent( next );
	    var body = loadUrlSync( url );
	    var entries = JSON.parse( body )['query']['pages'];
	    Object.keys( entries ).map( function( key ) {
		var entry = entries[key];
		articleIds[entry['title'].replace( / /g, '_' )] = undefined;
	    });
	    next = JSON.parse( body )['query-continue'] ? JSON.parse( body )['query-continue']['allpages']['gapcontinue'] : undefined;
	} while ( next );
    });

    finished();
}

function getRedirectIds( finished ) {
    console.log( 'Getting redirect ids...' );
    getRedirectIdsCount = Object.keys(articleIds).length;
    getRedirectIdsFinished = finished;

    function callback( articleId, finished ) { 
	var url = apiUrl + 'action=query&list=backlinks&blfilterredir=redirects&bllimit=500&format=json&bltitle=' + encodeURIComponent( articleId );
	getRedirectIdsCount -= 1;
	loadUrlAsync( url, function( body, articleId ) {
            console.info( 'Getting redirects for article ' + articleId + '...' );
	    try {
		var entries;
		entries = JSON.parse( body )['query']['backlinks'];
		entries.map( function( entry ) {
		    redirectIds[entry['title'].replace( / /g, '_' )] = articleId;
		});
		finished();
	    } catch( error ) {
		finished( error );
	    }
   
	    if ( getRedirectIdsCount <= 0 ) {
		getRedirectIdsFinished();
	    }
	}, articleId);
    }

    async.eachLimit( Object.keys(articleIds), maxParallelRequests, callback, function( err ) {
	if (err) {
            console.error( 'Error in getRedirectIds callback: ' + err );
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
    var escapedArticleId = encodeURIComponent( articleId );
    var div = doc.createElement( 'div' );
    var tpl = swig.compile( footerTemplateCode );
    div.innerHTML = tpl({ articleId: escapedArticleId, webUrl: webUrl, name: name });
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
    tryCount[ url ] = 0;
    do {
	try {
	    var req = httpsync.get({ url : url });
	    var res = req.end();
	    var content = res.data.toString('utf8');

	    if ( res.headers.location ) {
		console.info( "Redirect detected, load " + decodeURI( res.headers.location ) );
		return loadUrlSync( res.headers.location, callback );
	    } else {
		delete tryCount[ url ];
		if ( callback ) {
		    callback( content );
		    break;
		} else {
		    return content;
		}
	    }
	} catch ( error ) {
	    console.error( 'Unable to sync retrieve (try nb ' + tryCount[ url ]++ + ') ' + decodeURI( url ) + ' ( ' + error + ' )');
	    if ( maxTryCount && tryCount[ url ] > maxTryCount ) {
		console.error( 'Exit on purpose' );
		process.exit( 1 );
	    } else {
		console.error( 'Sleeping for ' + tryCount[ url ] + ' seconds' );
		sleep.sleep( tryCount[ url ] );
	    }
	}
    } while ( true );
}

function loadUrlAsync( url, callback, var1, var2, var3 ) {
    var nok = true;
    var finishedGlobal;
    var data;
    tryCount[ url ] = tryCount[ url ] ? tryCount[ url ] += 1 : 1;

    async.whilst(
	function() {
	    return nok;
	},
	function( finished ) {
	    finishedGlobal = finished;
	    var request = http.get( url, function( response ) {
		response.on( 'socket', function ( socket ) {
		    socket.on( 'close', function( error ) {
			finished( error );
		    });
		    socket.on( 'error', function( error ) {
			finished( error );
		    });
		    socket.on( 'timeout', function() {
			finished( "Pipe has timeouted..." );
		    });
		});
		response.on( 'error', function( error ) {
		    finished( error );
		});

		data = '';
		response.setEncoding( 'utf8' );
		response.on( 'data', function ( chunk ) {
			data += chunk;
		});
		response.on( 'close', function () {
		    nok = false;
		    finished();
		});
		response.on( 'end', function () {
		    nok = false;
		    if ( nok ) {
			finished();
		    }
		});
	    });

	    request.on( 'error', function( error ) {
		finished( error );
	    });
	    request.on( 'close', function() {
		finished();
	    });
	    request.on( 'socket', function ( socket ) {
		socket.on( 'close', function( error ) {
		    finished( error );
		});
		socket.on( 'error', function( error ) {
		    finished( error );
		});
		socket.on( 'timeout', function() {
		    finished( "Pipe has timeouted..." );
		});
	    });

	    request.end();
	},
	function( error ) {
	    if ( error ) {
		console.error( 'Unable to async retrieve (try nb ' + tryCount[ url ] + ') ' + decodeURI( url ) + ' ( ' + error + ' )');
		if ( maxTryCount && tryCount[ url ] > maxTryCount ) {
		    console.error( 'Exit on purpose' );
		    process.exit( 1 );
		} else {
		    console.info( 'Sleeping for ' + tryCount[ url ] + ' seconds' );
		    sleep.sleep( tryCount[ url ] );
		}
		loadUrlAsync( url, callback, var1, var2, var3 );
	    } else {
		delete tryCount[ url ];
		callback( data, var1, var2, var3 );		
	    }
	}
    );
}

function downloadMedia( url, filename ) {
    var parts = mediaRegex.exec( filename );
    console.log( filename );
    var width = parts[1].replace( /px\-/g, '' ) || 9999999;
    var filenameBase = parts[2] + parts[3] + ( parts[4] || '' );

    if ( mediaIds[ filenameBase ] && parseInt( mediaIds[ filenameBase ] ) >=  parseInt( width ) ) {
	return;
    } else {
	mediaIds[ filenameBase ] = width;
    }

    downloadFile( url, getMediaPath( filename ), true );
}

process.on( 'uncaughtException', function( error ) {
    console.trace( error );
    throw error;
    process.exit( 42 );
});


function downloadFile( url, path, force ) {
    fs.exists( path, function ( exists ) {
	if ( exists && !force ) {
	    console.info( path + ' already downloaded, download will be skipped.' );
	} else {
	    url = url.replace( /^https\:\/\//, 'http://' );
	    console.info( 'Downloading ' + decodeURI( url ) + ' at ' + path + '...' );
	    
	    createDirectoryRecursively( pathParser.dirname( path ) );

	    var nok = true;
	    var finishedGlobal;
	    var optimize = false;
	    tryCount[ url ] = tryCount[ url ] ? tryCount[ url ] += 1 : 1;

	    async.whilst(
		function() {
		    return nok;
		},
		function( finished ) {
		    finishedGlobal = finished;
		    var request = http.get( url, function( response ) {
			var writeFile = function( response, finished ) {
			    var mimeType = optimize ? response.headers['content-type'] : '';
			    var file = fs.createWriteStream( path );
			    file.on( 'error', function( error ) { optimize = false; finished( error ); } )
			    response.on( 'socket', function ( socket ) {
				socket.on( 'close', function( error ) {
				    finished( error );
				});
				socket.on( 'timeout', function() {
				    finished( "Pipe has timeouted..." );
				});
				socket.on( 'error', function( error ) {
				    finished( error );
				});
			    });
			    response.on( 'error', function( error ) {
				finished( error );
			    });
			    response.on( 'close', function() {
				finished();
			    });

			    switch( mimeType ) {
			    case 'image/png':
				response
				    .pipe( new pngquant( [ 192, '--ordered' ] ) )
				    .on( 'error', function( error ) { optimize = false; finished( error ); } )
				    .pipe( new pngcrush( [ '-brute', '-l', '9', '-rem', 'alla' ] ) )
				    .on( 'error', function( error ) { optimize = false; finished( error ); } )
				    .pipe( file )
				    .on( 'error', function( error ) { optimize = false; finished( error ); } )
				break;
			    case 'image/jpeg':
				response
				    .pipe( new jpegtran( [ '-copy', 'none', '-progressive', '-optimize' ] ) )
				    .on( 'error', function( error ) { optimize = false; finished( error ); } )
				    .pipe( file )
				    .on( 'error', function( error ) { optimize = false; finished( error ); } )
				break;
			    default:
				response.pipe( file )
				    .on( 'error', function( error ) { optimize = false; finished( error ); } )
				break;
			    }
			    
			    nok = false;
			    finished();
			};
			writeFile = smooth( writeFile, maxParallelRequests, maxParallelRequests, 180000 );
			writeFile( response, finished );
		    });

		    request.on( 'error', function( error ) {
			finished( error );
		    });
		    request.on( 'close', function() {
			finished();
		    });
		    request.on( 'socket', function ( socket ) {
			socket.on( 'close', function( error ) {
			    finished( error );
			});
			socket.on( 'error', function( error ) {
			    finished( error );
			});
			socket.on( 'timeout', function() {
			    finished( "Pipe has timeouted..." );
			});
		    });

		    request.end();
		},
		function( error ) {
		    if ( error ) {
			console.error( 'Unable to download (try nb ' + tryCount[ url ] + ') from ' + decodeURI( url ) + ' ( ' + error + ' )');
			if ( maxTryCount && tryCount[ url ] > maxTryCount ) {
			    console.error( 'Exit on purpose' );
			    process.exit( 1 );
			} else {
			    console.error( 'Sleeping for ' + tryCount[ url ] + 'seconds' );
			    sleep.sleep( tryCount );
			}
			downloadFile( url, path, force );
		    } else {
			delete tryCount[ url ];
		    }
		}
	    );
	}			    
    });
}

/* Internal path/url functions */
function getMediaUrl( filename ) {
    return '../../../../../' + getMediaBase( filename, true );
}

function getMediaPath( filename, escape ) {
    return rootPath + getMediaBase( filename, escape );
}

function getMediaBase( filename, escape ) {
    var parts = mediaRegex.exec( filename );
    var root = parts[2];

    if ( !root ) {
	console.error( 'Unable to parse filename \'' + filename + '\'' );
	process.exit( 1 );
    }

    function e( string ) {
	return ( string === undefined ? undefined :
		 escape ? encodeURIComponent( string ) : string );
    }

    return mediaDirectory + '/' + ( e( root[0] ) || '_' ) + '/' + ( e( root[1] ) || '_' ) + '/' + 
	( e( root[2] ) || '_' ) + '/' + ( e( root[3] ) || '_' ) + '/' + e( parts[2] + parts[3] + ( parts[4] || '' ) );
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

    return htmlDirectory + '/' + ( e( dirBase[0] ) || '_' ) + '/' + ( e( dirBase[1] ) || '_' ) + '/' + 
	( e( dirBase[2] ) || '_' ) + '/' + ( e( dirBase[3] ) || '_' ) + '/' + e( filename ) + '.html';
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
	    articleIds[ parts[ 1 ] ] = undefined;
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
	if ( parts[ 1 ] ) {
	    ltr = ( parts[ 1 ] === 'ltr' );
	} else {
	    console.error( 'Unable to get the language direction' );
	    process.exit( 1 );
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
