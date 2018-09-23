"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var Logger = /** @class */ (function () {
    function Logger(verbose) {
        this.verbose = verbose;
    }
    Logger.prototype.log = function (msg) {
        if (this.verbose) {
            console.info(msg);
        }
    };
    return Logger;
}());
exports.default = Logger;
