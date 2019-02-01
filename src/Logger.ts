class Logger {
  public verbose: boolean;
  constructor(verbose: boolean) {
    this.verbose = verbose;
  }

  public getTs() {
    return (new Date()).toISOString();
  }

  public info(...args: any[]) {
    if (this.verbose) {
      console.info(`[info] [${this.getTs()}]`, ...args);
    }
  }

  public log(...args: any[]) {
    console.log(`[log] [${this.getTs()}]`, ...args);
  }

  public warn(...args: any[]) {
    if (this.verbose) {
      console.warn(`[warn] [${this.getTs()}]`, ...args);
    }
  }

  public error(...args: any[]) {
    console.error(`[error] [${this.getTs()}]`, ...args);
  }
}

// export default Logger;
const logger = new Logger(!!process.env.verbose)
export default logger
