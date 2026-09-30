import { ErrorReply } from 'redis'
import type { RedisClientType } from 'redis'
import * as logger from '../Logger.js'

// Must be longer than the time the client tries to reconnect (see reconnect strategy in RedisStore), so
// that commands keep being retried until connection is back or client gives up
const MAX_RETRY_DURATION_MS = 2 * 60 * 1000
const RETRY_DELAY_MS = 1000

/**
 * Run a Redis command, retrying it when it failed because the connection to Redis was lost.
 *
 * When the connection drops (e.g. ECONNRESET), the Redis client rejects commands which were awaiting a
 * reply and automatically reconnects (see reconnect strategy in RedisStore). Commands sent while the
 * client is reconnecting are queued until connection is back, so retrying a rejected command is enough to
 * survive a transient connection loss (retried commands may time out while waiting in this queue, hence the
 * retry until a deadline). We do not retry errors returned by Redis server itself, nor when the client is
 * closed (i.e. it gave up reconnecting or has been closed on purpose).
 */
export async function withRedisRetry<T>(client: RedisClientType, command: () => Promise<T>): Promise<T> {
  const deadline = Date.now() + MAX_RETRY_DURATION_MS
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await command()
    } catch (err: any) {
      if (err instanceof ErrorReply || !client.isOpen || Date.now() >= deadline) {
        throw err
      }
      logger.warn(`Redis command failed (attempt ${attempt}), retrying: ${err?.message || err}`)
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS))
    }
  }
}
