import * as logger from '../Logger.js'
import Downloader from '../Downloader.js'
import RedisStore from '../RedisStore.js'
import { Creator, StringItem } from '@openzim/libzim'
import pmap from 'p-map'
import { Dump } from '../Dump.js'
import { parseRetryAfterHeader } from './misc.js'
import { FILES_DOWNLOAD_FAILURE_MINIMUM_FOR_CHECK, FILES_DOWNLOAD_FAILURE_TRESHOLD_PER_TEN_THOUSAND, MAX_FILE_DOWNLOAD_RETRIES } from './const.js'
import urlHelper from './url.helper.js'
import { fileDownloadMutex, zimCreatorMutex } from '../mutex.js'
import RedisQueue from './RedisQueue.js'

const MAXIMUM_FILE_DOWNLOAD_DELAY = 20000

interface HostData {
  queue: RedisQueue<FileToDownload>
  lastRequestDate?: number
  requestInterval: number
  notBeforeDate?: number
  downloadSuccess: number
  downloadFailure: number
  downloadsComplete: boolean
}

class FileManager {
  private static instance: FileManager
  public static getInstance() {
    if (!FileManager.instance) {
      FileManager.instance = new FileManager()
    }
    return FileManager.instance
  }

  private hosts: Map<string, HostData> = new Map()

  private get filesToDownloadXPath(): RKVS<FileDetail> {
    return RedisStore.filesToDownloadXPath
  }

  private constructor() {}

  /**
   * Reset internal state for a new dump cycle.
   */
  public reset(): void {
    this.hosts = new Map()
  }

  /**
   * Add a single file to download. Checks dedup via filesToDownloadXPath.
   * On first add: writes to both filesToDownloadXPath and host queue.
   * On resolution upgrade: updates filesToDownloadXPath only (queue already has the path).
   *
   * This method is typically called multiple times when the file is an image and the scraper detects
   * a second use of an image already seen but with a higher resolution. Could be that we call this
   * method twice with different urls / data for other usage in the future.
   */
  public async addFileToProcess(path: string, detail: FileDetail): Promise<void> {
    const existing = await this.filesToDownloadXPath.get(path)
    if (existing) {
      const isHigherRes = existing.width < (detail.width || 10e6) || existing.mult < (detail.mult || 1)
      if (!isHigherRes) return
      // Resolution upgrade: update store only, queue already has this path
      await this.filesToDownloadXPath.set(path, detail)
      return
    }
    // New file: add to both store and host queue
    await this.filesToDownloadXPath.set(path, detail)
    await this.pushToHostQueue(path, detail)
  }

  /**
   * Batch version of addFileToProcess. Uses getMany for efficiency.
   */
  public async addManyFilesToProcess(files: KVS<FileDetail>): Promise<void> {
    const paths = Object.keys(files)
    if (!paths.length) return

    const existingVals = await this.filesToDownloadXPath.getMany(paths)
    const toSet: KVS<FileDetail> = {}

    for (const [path, detail] of Object.entries(files)) {
      const existing = existingVals[path]
      if (existing) {
        const isHigherRes = existing.width < (detail.width || 10e6) || existing.mult < (detail.mult || 1)
        if (!isHigherRes) continue
        toSet[path] = detail // upgrade only, no queue push
      } else {
        toSet[path] = detail
        await this.pushToHostQueue(path, detail)
      }
    }

    if (Object.keys(toSet).length) {
      await this.filesToDownloadXPath.setMany(toSet)
    }
  }

  private async pushToHostQueue(path: string, detail: FileDetail): Promise<void> {
    const hostname = new URL(urlHelper.deserializeUrl(detail.url)).hostname
    if (!this.hosts.has(hostname)) {
      const queue = new RedisQueue<FileToDownload>(RedisStore.client, `${hostname}-files`)
      await queue.flush()
      RedisStore.filesQueues.push(queue)
      this.hosts.set(hostname, {
        queue,
        requestInterval: 30,
        downloadSuccess: 0,
        downloadFailure: 0,
        downloadsComplete: false,
      })
    }
    await this.hosts.get(hostname).queue.push({
      path,
      downloadAttempts: 0,
    })
  }

  /**
   * Start download workers. Queues are already populated via addFileToProcess/addManyFilesToProcess.
   */
  public async startDownloading(zimCreator: Creator, dump: Dump): Promise<void> {
    const filesTotal = await this.filesToDownloadXPath.len()
    let prevPercentProgress: string

    const hosts = this.hosts
    const filesToDownloadXPath = this.filesToDownloadXPath

    async function getNextFileToDownload(): Promise<{ fileToDownload: FileToDownload; hostData: HostData; hostname: string }> {
      const startPolling = Date.now()
      while (true) {
        if (startPolling + 1000 * 60 * 60 < Date.now()) {
          logger.warn('No file to download for more than 1 hour, exiting the loop')
          for (const hostData of hosts.values()) {
            if (hostData.downloadsComplete) continue
            while (await hostData.queue.pop()) {
              dump.status.files.fail += 1
              if (
                dump.status.files.fail > FILES_DOWNLOAD_FAILURE_MINIMUM_FOR_CHECK &&
                (dump.status.files.fail * 10000) / filesTotal > FILES_DOWNLOAD_FAILURE_TRESHOLD_PER_TEN_THOUSAND
              ) {
                throw new Error(`Too many files failed to download: [${dump.status.files.fail}/${filesTotal}]`)
              }
            }
          }
          return null
        }

        const hostValues = Array.from(hosts.values())
        const completedHosts = hostValues.reduce((buf, host) => {
          return host.downloadsComplete ? buf + 1 : buf
        }, 0)
        if (completedHosts === hostValues.length) return null

        for (const [hostname, hostData] of hosts.entries()) {
          if (
            hostData.downloadsComplete ||
            (hostData.notBeforeDate && hostData.notBeforeDate > Date.now()) ||
            (hostData.lastRequestDate && hostData.lastRequestDate + hostData.requestInterval > Date.now())
          ) {
            continue
          }

          const fileToDownload = await hostData.queue.pop()
          if (!fileToDownload) {
            hostData.downloadsComplete = true
            continue
          }

          hostData.lastRequestDate = Date.now()
          return { fileToDownload, hostData, hostname }
        }

        await new Promise((resolve) => setTimeout(resolve, 10))
      }
    }

    async function workerDownloadFile(fileToDownload: FileToDownload, hostname: string, hostData: HostData, workerId: number) {
      if ((dump.status.files.success + dump.status.files.fail) % (10 * Downloader.speed) === 0) {
        const percentProgress = (((dump.status.files.success + dump.status.files.fail) / filesTotal) * 100).toFixed(1)
        if (percentProgress !== prevPercentProgress) {
          prevPercentProgress = percentProgress
          logger.log(`Progress downloading files [${dump.status.files.success + dump.status.files.fail}/${filesTotal}] [${percentProgress}%]`)
        }
        if (
          filesTotal > 0 &&
          dump.status.files.fail > FILES_DOWNLOAD_FAILURE_MINIMUM_FOR_CHECK &&
          (dump.status.files.fail * 10000) / filesTotal > FILES_DOWNLOAD_FAILURE_TRESHOLD_PER_TEN_THOUSAND
        ) {
          throw new Error(`Too many files failed to download: [${dump.status.files.fail}/${filesTotal}]`)
        }
      }

      fileToDownload.downloadAttempts += 1

      // Read latest details from filesToDownloadXPath (resolution may have been upgraded since queuing)
      const latestDetail = await filesToDownloadXPath.get(fileToDownload.path)

      if (!latestDetail) {
        logger.warn(`File details missing in RedisStore for path [${fileToDownload.path}], unable to download`)
        dump.status.files.fail += 1
        hostData.downloadFailure += 1
        return
      }

      const downloadUrl = latestDetail.url
      const downloadKind = latestDetail.kind
      const downloadWidth = latestDetail.width

      logger.info(`Worker ${workerId} downloading ${urlHelper.deserializeUrl(downloadUrl)} (${downloadKind})`)
      await Downloader.downloadContent(downloadUrl, downloadKind, false, downloadWidth)
        .then(async (resp) => {
          if (resp && resp.content && resp.contentType) {
            const item = new StringItem(fileToDownload.path, resp.contentType, null, { FRONT_ARTICLE: 0 }, resp.content)
            await zimCreatorMutex.runExclusive(() => zimCreator.addItem(item))
            dump.status.files.success += 1
            hostData.downloadSuccess += 1
          } else {
            throw new Error(`Bad response received: ${resp}`)
          }
        })
        .catch(async (err) => {
          const isRetriableTransportError = !!(err?.response || err?.code)
          if (!isRetriableTransportError) {
            logger.warn(`Error processing file [${urlHelper.deserializeUrl(downloadUrl)}], skipping without retry`, err)
            dump.status.files.fail += 1
            hostData.downloadFailure += 1
            return
          }
          if (fileToDownload.downloadAttempts > MAX_FILE_DOWNLOAD_RETRIES || (err.response && err.response.status === 404)) {
            logger.warn(`Error downloading file [${urlHelper.deserializeUrl(downloadUrl)}] [status=${err.response?.status}], skipping`)
            dump.status.files.fail += 1
            hostData.downloadFailure += 1
          } else {
            if (err.response) {
              const retryAfterHeader = err.response.headers['retry-after']?.toString()
              if (retryAfterHeader) {
                const retryDate = parseRetryAfterHeader(retryAfterHeader)
                if (retryDate) {
                  if (retryDate > Date.now() + MAXIMUM_FILE_DOWNLOAD_DELAY) {
                    logger.log(`Received a [Retry-After=${retryAfterHeader}] on ${hostname} but this is too far away, ignoring`)
                  } else {
                    hostData.notBeforeDate = retryDate
                    logger.log(`Received a [Retry-After=${retryAfterHeader}], pausing down ${hostname} until ${hostData.notBeforeDate}`)
                  }
                } else {
                  logger.warn(`Received a [Retry-After=${retryAfterHeader}] from ${hostname} but failed to interpret it`)
                }
              }
            }
            if (err.response && [429, 503, 524].includes(err.response.status) && !urlHelper.deserializeUrl(downloadUrl).match(/^https?:\/\/upload\.wikimedia\.org\/.*\/thumb\//)) {
              hostData.requestInterval = Math.min(MAXIMUM_FILE_DOWNLOAD_DELAY, hostData.requestInterval * 1.2)
              logger.log(`Received a [status=${err.response.status}], slowing down ${hostname} to ${hostData.requestInterval}ms interval`)
            }
            await hostData.queue.push(fileToDownload)
          }
        })
    }

    await pmap(
      Array.from({ length: Downloader.speed }, (_, i) => i),
      async (workerId: number) => {
        while (true) {
          const nextFileData = await fileDownloadMutex.runExclusive(getNextFileToDownload)
          if (!nextFileData) break
          const { fileToDownload, hostname, hostData } = nextFileData
          await workerDownloadFile(fileToDownload, hostname, hostData, workerId)
        }
      },
      { concurrency: Downloader.speed },
    )

    logger.log(
      `Done with downloading ${filesTotal} files: ${dump.status.files.success} success, ${dump.status.files.fail} fail: `,
      JSON.stringify(Object.fromEntries([...hosts].map(([hostname, hostData]) => [hostname, { success: hostData.downloadSuccess, fail: hostData.downloadFailure }])), null, '\t'),
    )
  }
}

const fm = FileManager.getInstance()
export default fm as FileManager
