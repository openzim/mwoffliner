'use strict';

// Stub for now
function MediaWiki(logger, config) {
    this.logger = logger;

    // Normalize args
    this.base = config.base.replace(/\/$/, '') + '/';
    this.wikiPath = config.wikiPath !== undefined && config.wikiPath !== true ? config.wikiPath : 'wiki';
    this.apiPath = config.apiPath || 'w/api.php';
    this.domain = config.domain || '';
    this.username = config.username;
    this.password = config.password;
    this.apiUrl = this.base + this.apiPath + '?';
}

MediaWiki.prototype.login = function(downloader, cb) {
    if (this.username && this.password) {
        var url = this.apiUrl + 'action=login&format=json&lgname=' + this.username + '&lgpassword=' + this.password;
        if (this.domain) {
            url = url + '&lgdomain=' + this.domain;
        }

        this.downloader.downloadContent(url, function(content, responseHeaders) {
            var body = content.toString();
            var jsonResponse = JSON.parse(body)['login'];
            this.downloader.loginCookie = jsonResponse['cookieprefix'] + '_session=' + jsonResponse['sessionid'];

            if (jsonResponse['result'] == 'SUCCESS') {
                cb();
            } else {
                url = url + '&lgtoken=' + jsonResponse['token'];
                this.downloader.downloadContent(url, function (content, responseHeaders) {
                    body = content.toString();
                    jsonResponse = JSON.parse(body)['login'];

                    if (jsonResponse['result'] == 'Success') {
                        this.downloader.loginCookie = jsonResponse['cookieprefix'] + '_session=' + jsonResponse['sessionid'];
                        cb();
                    } else {
                        console.error('Login failed');
                        process.exit(1);
                    }
                });
            }
        });
    } else {
        cb();
    }
};

module.exports = {
    MediaWiki: MediaWiki,
};
