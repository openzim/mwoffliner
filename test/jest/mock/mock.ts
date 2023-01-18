import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import type { RedisKvs } from '../../../src/util/RedisKvs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const sgFile = await fs.promises.readFile(path.join(__dirname, './sg.json'))
const data: Array<{ n: string; r: number; t: string }> = JSON.parse(sgFile.toString())

export const initMockData = async (kvs: RedisKvs<any>, size?: number): Promise<void> => {
  const len = Object.keys(data).length
  const multiplier = (size ?? len) / len

  for (let i = 0; i < multiplier; i++) {
    const d: Array<{ n: string; r: number; t: string }> = []
    Object.values(data).forEach((item, x) => {
      d.push({ ...item, n: `${data[x].n}_${i}` })
    })
    await kvs.setMany(d)
  }
}
