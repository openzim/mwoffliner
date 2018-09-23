class Logger {
  public verbose: boolean;
  constructor(verbose) {
    this.verbose = verbose;
  }
  public log(msg) {
    if (this.verbose) {
      console.info(msg);
    }
  }
}

export default Logger;
