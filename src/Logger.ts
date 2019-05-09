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

  public logifyArray(arr: any[]) {
    if (arr.length < 3) {
      return JSON.stringify(arr);
    } else {
      const ret = arr.slice(0, 2).concat(`+${arr.length - 2} more`);
      return JSON.stringify(ret);
    }
  }
}

// export default Logger;
const logger = new Logger();
export default logger;
