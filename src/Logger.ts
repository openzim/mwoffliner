import winston from 'winston';
import { MongoDB } from 'winston-mongodb';
import moment from 'moment';

moment.locale(process.env.API_LOCALE);

const now = new Date();
const collection = `log-${+now}`;


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
  new MongoDB({
    db: process.env.MONGODB_URL,
    decolorize: true,
    level: 'debug',
    metaKey: 'meta',
    tryReconnect: true,
    leaveConnectionOpen: false,
    collection
  })
];

export default winston.createLogger({transports});
