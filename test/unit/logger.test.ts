import * as logger from '../../src/Logger.js'
import { jest } from '@jest/globals'

describe('Logger', () => {
  let stdoutSpy: ReturnType<typeof jest.spyOn>

  beforeEach(() => {
    stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true)
  })

  afterEach(() => {
    jest.clearAllMocks()
    logger.setLogLevel('silent')
  })

  test('debug level logs everything', async () => {
    logger.setLogLevel('debug')

    logger.debug('msg', 'a')
    logger.info('msg', 'b')
    logger.warn('msg', 'c')
    logger.error('msg', 'd')

    expect(stdoutSpy).toHaveBeenCalledTimes(4)
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('DEBUG'))
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('INFO'))
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('WARN'))
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('ERROR'))
  })

  test('info level suppresses debug', async () => {
    logger.setLogLevel('info')

    logger.debug('msg', 'a')
    logger.info('msg', 'b')
    logger.warn('msg', 'c')
    logger.error('msg', 'd')

    expect(stdoutSpy).toHaveBeenCalledTimes(3)
    expect(stdoutSpy).not.toHaveBeenCalledWith(expect.stringContaining('DEBUG'))
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('INFO'))
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('WARN'))
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('ERROR'))
  })

  test('warn level suppresses debug and info', async () => {
    logger.setLogLevel('warn')

    logger.debug('msg', 'a')
    logger.info('msg', 'b')
    logger.warn('msg', 'c')
    logger.error('msg', 'd')

    expect(stdoutSpy).toHaveBeenCalledTimes(2)
    expect(stdoutSpy).not.toHaveBeenCalledWith(expect.stringContaining('DEBUG'))
    expect(stdoutSpy).not.toHaveBeenCalledWith(expect.stringContaining('INFO'))
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('WARN'))
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('ERROR'))
  })

  test('error level logs only errors', async () => {
    logger.setLogLevel('error')

    logger.debug('msg', 'a')
    logger.info('msg', 'b')
    logger.warn('msg', 'c')
    logger.error('msg', 'd')

    expect(stdoutSpy).toHaveBeenCalledTimes(1)
    expect(stdoutSpy).not.toHaveBeenCalledWith(expect.stringContaining('DEBUG'))
    expect(stdoutSpy).not.toHaveBeenCalledWith(expect.stringContaining('INFO'))
    expect(stdoutSpy).not.toHaveBeenCalledWith(expect.stringContaining('WARN'))
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('ERROR'))
  })

  test('silent level suppresses all output', async () => {
    logger.setLogLevel('silent')

    logger.debug('msg', 'a')
    logger.info('msg', 'b')
    logger.warn('msg', 'c')
    logger.error('msg', 'd')

    expect(stdoutSpy).not.toHaveBeenCalled()
  })

  test('message content appears in output', async () => {
    logger.setLogLevel('debug')

    logger.debug('hello world')

    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('hello world'))
  })

  test('variadic args are concatenated in output', async () => {
    logger.setLogLevel('debug')

    logger.debug('prefix:', 'suffix')

    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('prefix:'))
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('suffix'))
  })
})
