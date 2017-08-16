'use strict';

// Stub for now
function MediaWiki(config) {
    // Normalize args
    this.base = config.base.replace(/\/$/, '') + '/';
    this.wikiPath = config.wikiPath !== undefined && config.wikiPath !== true ? config.wikiPath : 'wiki';
    this.apiPath = config.mwApiPath || 'w/api.php';
    this.domain = config.domain || '';
    this.username = config.username;
    this.password = config.password;
};

module.exports = {
    MediaWiki: MediaWiki,
};
