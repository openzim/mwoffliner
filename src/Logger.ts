import pino from 'pino';


const logger = pino({
  level: 'debug',
  // prettyPrint: {
  //   crlf: true
  // },
  customLevels: {
    verbose: 35
  },
  // @ts-ignore
  hooks: {
    logMethod (inputArgs: any[], method: any) {
      if (inputArgs.length < 2) {
        return method.apply(this, inputArgs);
      }
      const arg1 = inputArgs.shift();
      const arg2 = inputArgs.shift();
      return method.apply(this, [arg2, arg1, ...inputArgs]);
    }
  },
  formatters: {
    bindings(bindings) {
      return {};
    }
  }
});

export default logger;
