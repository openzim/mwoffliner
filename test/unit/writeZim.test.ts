import { join } from 'path'
import { Creator, StringItem } from '@openzim/libzim'
import { jest } from '@jest/globals'
import domino from 'domino'
import fs from 'fs'
import pmap from 'p-map'

jest.setTimeout(30000)

const now = new Date()
const testId = join(process.cwd(), `mwo-test-${+now}`)

describe('Writing ZIM', () => {
  const mainPageHtml = domino.createDocument('<html><body><h1>Test Write ZIM Main Page</h1></body></html>').documentElement.outerHTML
  const jsModuleDependencies = [
    `
    function test() { return true }
    `,
    `
    function test2() { return false }
    `,
  ]

  const cssModuleDependencies = [
    `
    body { background-color: red }
    `,
    `
    body { color: white }
    `,
  ]
  const article1 = `
<html><body><h1>Article 1</h1></body></html>
`
  const article2 = `
<html><body><h1>Article 2</h1></body></html>
`

  let zimCreator: Creator
  let outZim: string

  beforeAll(() => {
    fs.mkdirSync(testId)
    outZim = join(testId, 'test.zim')
  })

  beforeEach(() => {
    zimCreator = new Creator().configNbWorkers(1).configIndexing(true, 'en').configClusterSize(2048).startZimCreation(outZim)
  })

  test('Write ZIM single promise test', async () => {
    await zimCreator.addItem(new StringItem('Scraper', 'text/plain', 'Scraper', {}, `mwoffliner TEST`))

    await zimCreator.setMainPath('index')
    const index = new StringItem('index', 'text/html', 'Main Page', {}, mainPageHtml)
    await zimCreator.addItem(index)

    jsModuleDependencies.forEach(async (jsModule, i) => {
      const jsItem = new StringItem(`jsModule ${i}`, 'text/javascript', '', {}, jsModule)
      await zimCreator.addItem(jsItem)
    })

    cssModuleDependencies.forEach(async (cssModule, i) => {
      const cssItem = new StringItem(`cssModule ${i}`, 'text/css', '', {}, cssModule)
      await zimCreator.addItem(cssItem)
    })

    const article1Item = new StringItem('article1', 'text/html', 'Article 1', {}, article1)
    await zimCreator.addItem(article1Item)
    const article2Item = new StringItem('article2', 'text/html', 'Article 2', {}, article2)
    await zimCreator.addItem(article2Item)

    await zimCreator.addRedirection('Article_Two', 'ArticleTwo', 'article2')

    await zimCreator.finishZimCreation()
  })

  test('Write ZIM multiple promises test', async () => {
    zimCreator.addItem(new StringItem('Scraper', 'text/plain', 'Scraper', {}, `mwoffliner TEST`))

    const index = new StringItem('index', 'text/html', 'Main Page', {}, mainPageHtml)
    zimCreator.addItem(index)

    const jsPromises = jsModuleDependencies.map((jsModule, i) => {
      const jsItem = new StringItem(`jsModule ${i}`, 'text/javascript', '', {}, jsModule)
      return zimCreator.addItem(jsItem)
    })

    const cssPromises = cssModuleDependencies.map((cssModule, i) => {
      const cssItem = new StringItem(`cssModule ${i}`, 'text/css', '', {}, cssModule)
      return zimCreator.addItem(cssItem)
    })

    const article1Item = new StringItem('article1', 'text/html', 'Article 1', {}, article1)
    const article2Item = new StringItem('article2', 'text/html', 'Article 2', {}, article2)
    const articlePromises = [zimCreator.addItem(article1Item), zimCreator.addItem(article2Item)]

    await Promise.all([...jsPromises, ...cssPromises, ...articlePromises])
    await zimCreator.addRedirection('Article_Two', 'ArticleTwo', 'article2')
    await zimCreator.setMainPath('index')
    await zimCreator.finishZimCreation()
  })

  test('Write ZIM pmap test', async () => {
    zimCreator.addItem(new StringItem('Scraper', 'text/plain', 'Scraper', {}, `mwoffliner TEST`))

    const index = new StringItem('index', 'text/html', 'Main Page', {}, mainPageHtml)
    zimCreator.addItem(index)

    const jsItems = jsModuleDependencies.map((jsModule, i) => {
      return new StringItem(`jsModule ${i}`, 'text/javascript', '', {}, jsModule)
    })

    const cssItems = cssModuleDependencies.map((cssModule, i) => {
      return new StringItem(`cssModule ${i}`, 'text/css', '', {}, cssModule)
    })

    const articleItems = [new StringItem('article1', 'text/html', 'Article 1', {}, article1), new StringItem('article2', 'text/html', 'Article 2', {}, article2)]

    const allItems = [jsItems, cssItems, articleItems]

    await Promise.all(allItems.map(async (items) => pmap(items, async (item) => zimCreator.addItem(item), { concurrency: 8 })))

    await zimCreator.addRedirection('Article_Two', 'ArticleTwo', 'article2')
    await zimCreator.setMainPath('index')
    await zimCreator.finishZimCreation()
  })

  afterAll(() => {
    fs.rmSync(testId, { recursive: true })
  })
})
