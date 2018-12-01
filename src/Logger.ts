class Logger {
  public verbose: boolean;
  constructor(verbose) {
    this.verbose = verbose;
  }

  public getTs(prefix: string) {
    return `${prefix} [${(new Date()).toISOString()}]`;
  }

  public info(...args) {
    if (this.verbose) {
      console.info(this.getTs('[info]'), ...args);
    }
  }

  public log(...args) {
    console.log(this.getTs('[log]'), ...args);
  }

  public warn(...args) {
    console.warn(this.getTs('[warn]'), ...args);
  }

  public error(...args) {
    console.error(this.getTs('[error]'), ...args);
  }
}

export default Logger;
