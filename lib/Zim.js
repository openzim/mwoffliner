'use strict';

var async = require('async');
var mkdirp = require('mkdirp');
var homeDirExpander = require('expand-home-dir');
var fs = require('fs');

function Zim(args, logger) {
    Object.assign(this, args);
    this.logger = logger;

    // Normalize
    this.outputDirectory = this.outputDirectory ?
        homeDirExpander(this.outputDirectory) + '/' : 'out/';
    this.tmpDirectory = this.tmpDirectory ?
        homeDirExpander(this.tmpDirectory) + '/' : 'tmp/';
}

Zim.prototype.createDirectories = function(cb) {
    this.logger.log('Creating base directories...');
    async.series(
        [
            function(finished) { mkdirp(this.outputDirectory, finished); },
            function(finished) { mkdirp(this.tmpDirectory, finished); },
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

Zim.prototype.prepareCache = function(env, cb) {
    this.logger.log('Preparing cache...');
    this.cacheDirectory = this.cacheDirectory + env.computeFilenameRadical(true, true, true) + '/';
    this.redirectsCacheFile = this.cacheDirectory + env.computeFilenameRadical(false, true, true) + '.redirects';
    mkdirp(this.cacheDirectory + 'm/', function () {
        fs.writeFileSync(this.cacheDirectory + 'ref', '42');
        cb();
    });
};

module.exports = {
    Zim: Zim
};
