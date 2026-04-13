import * as logger from '../../src/Logger.js'
import { jest } from '@jest/globals'

describe('Logger', () => {
  let stdoutSpy: ReturnType<typeof jest.spyOn>

  afterEach(() => {
    jest.clearAllMocks()
  })

  beforeEach(() => {
    stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true)
  })

  test('logger info level', async () => {
    logger.setVerboseLevel('info')

    logger.info('test info', 'info test message')
    logger.log('test log', 'log test message')
    logger.warn('test warn', 'warn test message')
    logger.error('test error', 'error test message')

    expect(stdoutSpy).toHaveBeenCalledTimes(4)
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('[info]'))
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('[log]'))
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('[warn]'))
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('[error]'))
  })

  test('logger log level', async () => {
    logger.setVerboseLevel('log')

    logger.info('test info', 'info test message')
    logger.log('test log', 'log test message')
    logger.warn('test warn', 'warn test message')
    logger.error('test error', 'error test message')

    expect(stdoutSpy).toHaveBeenCalledTimes(3)
    expect(stdoutSpy).not.toHaveBeenCalledWith(expect.stringContaining('[info]'))
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('[log]'))
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('[warn]'))
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('[error]'))
  })

  test('logger warn level', async () => {
    logger.setVerboseLevel('warn')

    logger.info('test info', 'info test message')
    logger.log('test log', 'log test message')
    logger.warn('test warn', 'warn test message')
    logger.error('test error', 'error test message')

    expect(stdoutSpy).toHaveBeenCalledTimes(2)
    expect(stdoutSpy).not.toHaveBeenCalledWith(expect.stringContaining('[info]'))
    expect(stdoutSpy).not.toHaveBeenCalledWith(expect.stringContaining('[log]'))
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('[warn]'))
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('[error]'))
  })

  test('logger error level', async () => {
    logger.setVerboseLevel('error')

    logger.info('test info', 'info test message')
    logger.log('test log', 'log test message')
    logger.warn('test warn', 'warn test message')
    logger.error('test error', 'error test message')

    expect(stdoutSpy).toHaveBeenCalledTimes(1)
    expect(stdoutSpy).not.toHaveBeenCalledWith(expect.stringContaining('[info]'))
    expect(stdoutSpy).not.toHaveBeenCalledWith(expect.stringContaining('[log]'))
    expect(stdoutSpy).not.toHaveBeenCalledWith(expect.stringContaining('[warn]'))
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('[error]'))
  })

  test('logger verbose true', async () => {
    logger.setVerboseLevel('true')

    logger.info('test info', 'info test message')
    logger.log('test log', 'log test message')
    logger.warn('test warn', 'warn test message')
    logger.error('test error', 'error test message')

    expect(stdoutSpy).toHaveBeenCalledTimes(4)
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('[info]'))
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('[log]'))
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('[warn]'))
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('[error]'))
  })

  test('logger verbose empty', async () => {
    logger.setVerboseLevel(null)

    logger.info('test info', 'info test message')
    logger.log('test log', 'log test message')
    logger.warn('test warn', 'warn test message')
    logger.error('test error', 'error test message')

    expect(stdoutSpy).not.toHaveBeenCalled()
  })

  test('logger message format includes args', async () => {
    logger.setVerboseLevel('info')

    logger.info('test info', 'info test message')

    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('test info'))
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('info test message'))
  })
})
