function Logger(verbose) {
  this.verbose = verbose;
}

Logger.prototype.log = function log(msg) {
  if (this.verbose) {
    console.info(msg);
  }
};

export default Logger;
