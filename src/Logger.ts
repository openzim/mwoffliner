class Logger {
  public verbose: boolean;
  constructor(verbose) {
    this.verbose = verbose;
  }

  public getTs() {
    return (new Date()).toISOString();
  }

  public info(...args) {
    if (this.verbose) {
      console.info(`[info] [${this.getTs()}]`, ...args);
    }
  }

  public log(...args) {
    console.log(`[log] [${this.getTs()}]`, ...args);
  }

  public warn(...args) {
    if (this.verbose) {
      console.warn(`[warn] [${this.getTs()}]`, ...args);
    }
  }

  public error(...args) {
    console.error(`[error] [${this.getTs()}]`, ...args);
  }
}

export default Logger;
