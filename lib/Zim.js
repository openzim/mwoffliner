'use strict';

var async = require('async');
var domino = require('domino');
var mkdirp = require('mkdirp');
var homeDirExpander = require('expand-home-dir');
var exec = require('child_process').exec;
var spawn = require('child_process').spawn;
var pathParser = require('path');
var fs = require('fs');

function Zim(args) {
    Object.assign(this, args);

    // Normalize
    this.outputDirectory = this.outputDirectory ?
        homeDirExpander(this.outputDirectory) + '/' : 'out/';
    this.tmpDirectory = this.tmpDirectory ?
        homeDirExpander(this.tmpDirectory) + '/' : 'tmp/';
}

Zim.prototype.createDirectories = function(cb) {
    this.env.logger.log('Creating base directories...');
    var self = this;
    async.series(
        [
            function(finished) { mkdirp(self.outputDirectory, finished); },
            function(finished) { mkdirp(self.tmpDirectory, finished); },
        ],
        function (error) {
            if (error) {
                console.error('Unable to create mandatory directories : ' + error);
                process.exit(1);
            } else {
                cb();
            }
        }
    );
};

Zim.prototype.prepareCache = function(cb) {
    var env = this.env;
    var self = this;
    env.logger.log('Preparing cache...');
    this.cacheDirectory = this.cacheDirectory + env.computeFilenameRadical(true, true, true) + '/';
    this.redirectsCacheFile = this.cacheDirectory + env.computeFilenameRadical(false, true, true) + '.redirects';
    mkdirp(this.cacheDirectory + 'm/', function () {
        fs.writeFileSync(self.cacheDirectory + 'ref', '42');
        cb();
    });
};

Zim.prototype.getSubTitle = function(cb) {
    var env = this.env;
    env.logger.log('Getting sub-title...');
    env.downloader.downloadContent(env.mw.webUrl, function(content, responseHeaders) {
        var html = content.toString();
        var doc = domino.createDocument(html);
        var subTitleNode = doc.getElementById('siteSub');
        env.zim.subTitle = subTitleNode ? subTitleNode.innerHTML : '';
        cb();
    });
};

Zim.prototype.computeZimRootPath = function() {
    var zimRootPath = this.outputDirectory[0] === '/' ? this.outputDirectory : pathParser.resolve(process.cwd(), this.outputDirectory) + '/';
    zimRootPath += this.env.computeFilenameRadical() + '.zim';
    return zimRootPath;
};

Zim.prototype.computeZimName = function() {
    return (this.publisher ? this.publisher.toLowerCase() + '.' : '') + this.env.computeFilenameRadical(false, true, true);
};

Zim.prototype.executeTransparently = function(command, args, callback, nostdout, nostderr) {
    var logger = this.env.logger;
    try {
        var proc = spawn(command, args).on('error', function (error) {
            console.error('Error in executeTransparently(), ' + error);
            process.exit(1);
        });

        if (!nostdout) {
            proc.stdout
                .on('data', function (data) {
                    logger.log(data.toString().replace(/[\n\r]/g, ''));
                })
                .on('error', function (error) {
                    console.error('STDOUT output error: ' + error);
                });
        }

        if (!nostderr) {
            proc.stderr
                .on('data', function (data) {
                    console.error(data.toString().replace(/[\n\r]/g, ''));
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
};

Zim.prototype.buildZIM = function(cb) {
    var env = this.env;
    var zim = this;
    var logger = this.env.logger;
    if (!env.nozim) {

        // Compute tags
        var tags = env.nopic ? 'nopic' : env.novid ? 'novid' : '';
        tags = tags + (env.nodet ? tags ? ';nodet' : 'nodet' : '');

        exec('sync', function (error) {
            var zimPath = zim.computeZimRootPath();
            var cmd = 'zimwriterfs --welcome=index.htm --favicon=favicon.png --language=' + zim.langIso3 +
                (zim.mainPageId ? ' --welcome=' + env.getArticleBase(zim.mainPageId) : ' --welcome=index.htm') +
                (env.deflateTmpHtml ? ' --inflateHtml ' : '') +
                (env.verbose ? ' --verbose ' : '') +
                (tags ? ' --tags="' + tags + '"' : '') +
                ' --name="' + zim.computeZimName() + '"' +
                (zim.withZimFullTextIndex ? ' --withFullTextIndex' : '') +
                (env.writeHtmlRedirects ? '' : ' --redirects="' + zim.redirectsCacheFile + '"') +
                ' --title="' + zim.name + '" --description="' + (zim.description || zim.subTitle || zim.name) + '" --creator="' + zim.creator + '" --publisher="' +
                zim.publisher + '" "' + env.htmlRootPath + '" "' + zimPath + '"';
            logger.log('Building ZIM file ' + zimPath + ' (' + cmd + ')...');
            logger.log('RAID: ' + zim.computeZimName());
            zim.executeTransparently(
                'zimwriterfs',
                [
                    env.deflateTmpHtml ? '--inflateHtml' : '',
                    env.verbose ? '--verbose' : '',
                    env.writeHtmlRedirects ? '' : '--redirects=' + zim.redirectsCacheFile,
                    zim.withZimFullTextIndex ? '--withFullTextIndex' : '',
                    tags ? '--tags=' + tags : '',
                    zim.mainPageId ? '--welcome=' + env.getArticleBase(zim.mainPageId) : '--welcome=index.htm',
                    '--favicon=favicon.png',
                    '--language=' + zim.langIso3,
                    '--title=' + zim.name,
                    '--name=' + zim.computeZimName(),
                    '--description=' + (zim.description || zim.subTitle || zim.name),
                    '--creator=' + zim.creator,
                    '--publisher=' + zim.publisher,
                    env.htmlRootPath,
                    zimPath
                ],
                function (error) {
                    if (error) {
                        console.error('Failed to build successfuly the ZIM file ' + zimPath + ' (' + error + ')');
                        process.exit(1);
                    } else {
                        logger.log('ZIM file built at ' + zimPath);
                    }

                    /* Delete the html directory ? */
                    if (env.keepHtml) {
                        cb();
                    } else {
                        exec('rm -rf \"' + env.htmlRootPath + '\"', cb);
                    }
                },
                !env.verbose,
                !env.verbose
            );
        }).on('error', function (error) { console.error(error); });
    } else {
        cb();
    }
};

module.exports = {
    Zim: Zim
};
