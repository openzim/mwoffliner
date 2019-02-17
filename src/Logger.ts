class Logger {
  public getTs() {
    return (new Date()).toISOString();
  }

  public info(...args: any[]) {
    if (!!(process as any).verbose) {
      console.info(`[info] [${this.getTs()}]`, ...args);
    }
  }

  public log(...args: any[]) {
    console.log(`[log] [${this.getTs()}]`, ...args);
  }

  public warn(...args: any[]) {
    if (!!(process as any).verbose) {
      console.warn(`[warn] [${this.getTs()}]`, ...args);
    }
  }

  public error(...args: any[]) {
    console.error(`[error] [${this.getTs()}]`, ...args);
  }
}

// export default Logger;
const logger = new Logger();
export default logger;
