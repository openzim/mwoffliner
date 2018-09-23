'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
function Logger(verbose) {
    this.verbose = verbose;
}
Logger.prototype.log = function (msg) {
    if (this.verbose) {
        console.info(msg);
    }
};
exports.default = Logger;
