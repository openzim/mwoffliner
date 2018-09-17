'use strict';

function Logger(verbose) {
  this.verbose = verbose;
}

Logger.prototype.log = function (msg) {
  if (this.verbose) {
    console.info(msg);
  }
};

module.exports = {
  Logger: Logger,
};
