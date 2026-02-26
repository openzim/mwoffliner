/**
 * Jest setup file to properly cleanup HTTP connections after tests
 * This prevents "Jest environment has been torn down" errors from unclosed TCP connections
 */

import Downloader from '../src/Downloader.js'

// Cleanup HTTP agents after each test to close TCP connections
afterEach(async () => {
  try {
    await Downloader.destroy()
  } catch {
    // Silently ignore errors during cleanup
  }
})
