"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var Logger = /** @class */ (function () {
    function Logger(verbose) {
        this.verbose = verbose;
    }
    Logger.prototype.getTs = function (prefix) {
        return prefix + " [" + (new Date()).toISOString() + "]";
    };
    Logger.prototype.info = function () {
        var args = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            args[_i] = arguments[_i];
        }
        if (this.verbose) {
            console.info.apply(console, [this.getTs('[info]')].concat(args));
        }
    };
    Logger.prototype.log = function () {
        var args = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            args[_i] = arguments[_i];
        }
        console.log.apply(console, [this.getTs('[log]')].concat(args));
    };
    Logger.prototype.warn = function () {
        var args = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            args[_i] = arguments[_i];
        }
        console.warn.apply(console, [this.getTs('[warn]')].concat(args));
    };
    Logger.prototype.error = function () {
        var args = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            args[_i] = arguments[_i];
        }
        console.error.apply(console, [this.getTs('[error]')].concat(args));
    };
    return Logger;
}());
exports.default = Logger;
