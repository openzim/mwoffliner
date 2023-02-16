const logLevels = ['info', 'log', 'warn', 'error']
type LogLevel = (typeof logLevels)[number]

const isVerbose = (level: LogLevel) => {
  const verboseLevel = (process as any).verbose

  if (!verboseLevel) {
    return false
  }

  if (!logLevels.includes(verboseLevel)) {
    return true
  }

  const verboseLevelIndex = logLevels.indexOf(verboseLevel)
  const logLevelIndex = logLevels.indexOf(level)
  if (logLevelIndex >= verboseLevelIndex) {
    return true
  } else {
    return false
  }
}

const doLog = (type: LogLevel, args: any[]) => {
  if (isVerbose(type)) {
    console[type](`[${type}] [${getTs()}]`, ...args)
  }
}

const getTs = () => {
  return new Date().toISOString()
}

export const info = (...args: any[]) => {
  doLog('info', args)
}

export const log = (...args: any[]) => {
  doLog('log', args)
}

export const warn = (...args: any[]) => {
  doLog('warn', args)
}

export const error = (...args: any[]) => {
  doLog('error', args)
}

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
