import Pino from 'pino';

const Logger = Pino({
  level: 'debug',
  // prettyPrint: {
  //   crlf: true
  // },
  customLevels: {
    verbose: 35
  }
});

export default Logger.pino;
