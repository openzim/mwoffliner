"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var Logger = /** @class */ (function () {
    function Logger(verbose) {
        this.verbose = verbose;
    }
    Logger.prototype.getTs = function () {
        return (new Date()).toISOString();
    };
    Logger.prototype.info = function () {
        var args = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            args[_i] = arguments[_i];
        }
        if (this.verbose) {
            console.info.apply(console, ["[info] [" + this.getTs() + "]"].concat(args));
        }
    };
    Logger.prototype.log = function () {
        var args = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            args[_i] = arguments[_i];
        }
        console.log.apply(console, ["[log] [" + this.getTs() + "]"].concat(args));
    };
    Logger.prototype.warn = function () {
        var args = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            args[_i] = arguments[_i];
        }
        if (this.verbose) {
            console.warn.apply(console, ["[warn] [" + this.getTs() + "]"].concat(args));
        }
    };
    Logger.prototype.error = function () {
        var args = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            args[_i] = arguments[_i];
        }
        console.error.apply(console, ["[error] [" + this.getTs() + "]"].concat(args));
    };
    return Logger;
}());
exports.default = Logger;
