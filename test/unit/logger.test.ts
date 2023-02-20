import * as logger from '../../src/Logger.js'
import { jest } from '@jest/globals'

describe('Logger', () => {
  let info
  let log
  let warn
  let error

  afterEach(() => {
    jest.clearAllMocks()
  })

  beforeEach(() => {
    info = jest.spyOn(console, 'info').mockImplementation(() => {
      return
    })
    log = jest.spyOn(console, 'log').mockImplementation(() => {
      return
    })
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {
      return
    })
    error = jest.spyOn(console, 'error').mockImplementation(() => {
      return
    })
  })

  test('logger info level', async () => {
    logger.setVerboseLevel('info')

    logger.info('test info', 'info test message')
    logger.log('test log', 'log test message')
    logger.warn('test warn', 'warn test message')
    logger.error('test error', 'error test message')

    expect(info).toBeCalledWith(expect.any(String), 'test info', 'info test message')
    expect(log).toBeCalledWith(expect.any(String), 'test log', 'log test message')
    expect(warn).toBeCalledWith(expect.any(String), 'test warn', 'warn test message')
    expect(error).toBeCalledWith(expect.any(String), 'test error', 'error test message')
  })

  test('logger log level', async () => {
    logger.setVerboseLevel('log')

    logger.info('test info', 'info test message')
    logger.log('test log', 'log test message')
    logger.warn('test warn', 'warn test message')
    logger.error('test error', 'error test message')

    expect(info).not.toBeCalled()
    expect(log).toBeCalledWith(expect.any(String), 'test log', 'log test message')
    expect(warn).toBeCalledWith(expect.any(String), 'test warn', 'warn test message')
    expect(error).toBeCalledWith(expect.any(String), 'test error', 'error test message')
  })

  test('logger warn level', async () => {
    logger.setVerboseLevel('warn')

    logger.info('test info', 'info test message')
    logger.log('test log', 'log test message')
    logger.warn('test warn', 'warn test message')
    logger.error('test error', 'error test message')

    expect(info).not.toBeCalled()
    expect(log).not.toBeCalled()
    expect(warn).toBeCalledWith(expect.any(String), 'test warn', 'warn test message')
    expect(error).toBeCalledWith(expect.any(String), 'test error', 'error test message')
  })

  test('logger error level', async () => {
    logger.setVerboseLevel('error')

    logger.info('test info', 'info test message')
    logger.log('test log', 'log test message')
    logger.warn('test warn', 'warn test message')
    logger.error('test error', 'error test message')

    expect(info).not.toBeCalled()
    expect(log).not.toBeCalled()
    expect(warn).not.toBeCalled()
    expect(error).toBeCalledWith(expect.any(String), 'test error', 'error test message')
  })

  test('logger verbose true', async () => {
    logger.setVerboseLevel('true')

    logger.info('test info', 'info test message')
    logger.log('test log', 'log test message')
    logger.warn('test warn', 'warn test message')
    logger.error('test error', 'error test message')

    expect(info).toBeCalledWith(expect.any(String), 'test info', 'info test message')
    expect(log).toBeCalledWith(expect.any(String), 'test log', 'log test message')
    expect(warn).toBeCalledWith(expect.any(String), 'test warn', 'warn test message')
    expect(error).toBeCalledWith(expect.any(String), 'test error', 'error test message')
  })

  test('logger verbose empty', async () => {
    logger.setVerboseLevel(null)

    logger.info('test info', 'info test message')
    logger.log('test log', 'log test message')
    logger.warn('test warn', 'warn test message')
    logger.error('test error', 'error test message')

    expect(info).not.toBeCalled()
    expect(log).not.toBeCalled()
    expect(warn).not.toBeCalled()
    expect(error).not.toBeCalled()
  })
})
