import { writeFile } from 'fs/promises'
import crypto from 'crypto'
import * as path from 'path'
import { pathToFileURL } from 'url'
import * as logger from '../Logger.js'
import Downloader from '../Downloader.js'
import { getTmpDirectory } from './misc.js'

export function isCustomFlavourUrl(customFlavour: string): boolean {
  return /^https?:\/\//i.test(customFlavour)
}

// Load the custom flavour module given with --customFlavour. A URL is downloaded into the
// temporary directory first; as a .mjs file, it is loaded as an ES module like the
// flavours in extensions/.
export async function loadCustomFlavour(customFlavour: string): Promise<any> {
  let modulePath = customFlavour
  if (isCustomFlavourUrl(customFlavour)) {
    logger.info(`Downloading custom flavour [${customFlavour}]`)
    const { data } = await Downloader.request({ url: customFlavour, method: 'GET', responseType: 'text' })
    const hash = crypto.createHash('md5').update(customFlavour).digest('hex').slice(0, 8)
    modulePath = path.join(await getTmpDirectory(), `customFlavour-${hash}.mjs`)
    await writeFile(modulePath, data)
  }
  return new (await import(pathToFileURL(modulePath).href)).default()
}
