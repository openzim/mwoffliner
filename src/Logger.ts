import { format } from 'util'
import pino from 'pino'
import pinoPretty from 'pino-pretty'

export const logLevels = ['debug', 'info', 'warn', 'error', 'silent'] as const
export type LogLevel = (typeof logLevels)[number]

// Passing process.stdout as destination makes pino-pretty write via process.stdout.write()
// rather than via sonic-boom / fs.writeSync, which keeps jest spies working in tests.
const stream = pinoPretty({
  colorize: process.stdout.isTTY ?? false,
  destination: process.stdout,
  ignore: 'pid,hostname',
  translateTime: 'UTC:yyyy-mm-dd HH:MM:ss.l',
})
const _pino = pino({ level: 'silent' }, stream)

export const setLogLevel = (level: LogLevel) => {
  _pino.level = level
}

const makeLogFn = (pinoLevel: 'debug' | 'info' | 'warn' | 'error') => {
  return (msg: string, ...args: any[]) => {
    if (args.length === 1 && args[0] instanceof Error) {
      _pino[pinoLevel]({ err: args[0] }, msg)
    } else if (args.length > 0) {
      _pino[pinoLevel](format(msg, ...args))
    } else {
      _pino[pinoLevel](msg)
    }
  }
}

export const debug = makeLogFn('debug')
export const info = makeLogFn('info')
export const warn = makeLogFn('warn')
export const error = makeLogFn('error')

export const logifyArray = (arr: any[]) => {
  if (arr.length < 3) {
    return JSON.stringify(arr)
  } else {
    const ret = arr
      .slice(0, 1)
      .concat(`+${arr.length - 2} more +`)
      .concat(arr[arr.length - 1])
    return JSON.stringify(ret)
  }
}
