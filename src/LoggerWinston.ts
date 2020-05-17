import winston from 'winston';
// import { MongoDB } from 'winston-mongodb';
// @ts-ignore
import Pg from 'winston-pg-native';
import moment from 'moment';

moment.locale(process.env.API_LOCALE);

const now = new Date();
const target = `log-${+now}`;


const transports = [

  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.timestamp(),
      winston.format.align(),
      winston.format.printf((info) => {
        const {
          timestamp, level, message, ...args
        } = info;

        const ts = timestamp.slice(0, 19).replace('T', ' ');
        return `${ts} [${level}]: ${message} ${Object.keys(args).length ? JSON.stringify(args, null, 2) : ''}`;
      }),
    ),
    level: 'info'
  }),
  // new MongoDB({
  //   db: process.env.LOGGER,
  //   decolorize: true,
  //   level: 'debug',
  //   metaKey: 'meta',
  //   tryReconnect: true,
  //   leaveConnectionOpen: false,
  //   target
  // }),
  new Pg({
    connectionString: process.env.LOGGER,
    level: 'debug',
    poolConfig: {
      connectionTimeoutMillis: 0,
      idleTimeoutMillis: 0,
      max: 10
    },
    tableName: target
  })
];

export default winston.createLogger({transports});
