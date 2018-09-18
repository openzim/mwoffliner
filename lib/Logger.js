class Logger {
  constructor(verbose) {
    this.verbose = verbose;
  }

  log(msg) {
    if (this.verbose) {
      console.info(msg);
    }
  }
}


export default Logger;
