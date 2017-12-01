'use strict';

var fs = require('fs');

var Utils = {
    validateEmail: function(email) {
        var emailRegex = /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
        return emailRegex.test(email);
    },

    lcFirst: function(str) {
        str += '';
        var f = str.charAt(0).toLowerCase();
        return f + str.substr(1);
    },

    ucFirst: function(str) {
        str += '';
        var f = str.charAt(0).toUpperCase();
        return f + str.substr(1);
    },

    decodeURIComponent: function(uri) {
        try {
            return decodeURIComponent(uri);
        } catch (error) {
            console.error(error);
            return uri;
        }
    },

    touch: function(paths) {
        var currentDate = Date.now();
        paths = paths instanceof Array ? paths : [paths];
        paths.map(function (path) {
            fs.utimes(path, currentDate, currentDate, () => {});
        });
    },
};

module.exports = {
    Utils: Utils
};
