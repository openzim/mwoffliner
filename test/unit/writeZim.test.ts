import { join, resolve } from 'path'
import { Creator, StringItem } from '@openzim/libzim'
import { jest } from '@jest/globals'
import domino from 'domino'
import fs from 'fs'
import pmap from 'p-map'
import pathParser from 'path'

jest.setTimeout(30000)

const now = new Date()
const testId = join(process.cwd(), `mwo-test-${+now}`)

function readFilePromise(path: string, encoding: fs.EncodingOption = 'utf8'): Promise<string | Buffer> {
  return new Promise<string | Buffer>((resolve, reject) => {
    fs.readFile(path, encoding, (err, content) => {
      if (err) {
        reject(err)
      } else {
        resolve(content)
      }
    })
  })
}

function cssPath(css: string, subDirectory = '') {
  return `${subDirectory ? `${subDirectory}/` : ''}${css.replace(/(\.css)?$/, '')}.css`
}

function jsPath(js: string, subDirectory = '') {
  const path = js.startsWith('../node_module') ? js.replace('../node_modules', 'node_module') : js
  const prefix = subDirectory ? `${testId}` : ''
  const ext = path.replace(/(\.js)?$/, '')
  return `${prefix}${ext}.js`
}

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

    const articleItems = []
    for (let i = 0; i < 20; i++) {
      articleItems.push(new StringItem(`article${i}`, 'text/html', `Article ${i}`, {}, `<h1>Article ${i}</h1>`.repeat(1000)))
    }

    const allItems = [jsItems, cssItems, articleItems]
    for (const items of allItems) {
      await pmap(
        items,
        async (item) => {
          await new Promise((resolve) => setTimeout(resolve, Math.random() * 1000))
          await zimCreator.addItem(item)
        },
        { concurrency: 8 },
      )
    }

    await zimCreator.addRedirection('Article_Two', 'ArticleTwo', 'article2')
    await zimCreator.setMainPath('index')
    await zimCreator.finishZimCreation()
  })

  test('Write ZIM static file test', async () => {
    const promises = []
    const staticFiles = [
      'script.js',
      'masonry.min.js',
      'article_list_home.js',
      'images_loaded.min.js',
      'style.css',
      'mobile_main_page.css',
      'wm_mobile_override_script.js',
      'wm_mobile_override_style.css',
    ]

    for (const file of staticFiles) {
      let url: string
      let mimetype: string
      if (file.endsWith('.css')) {
        url = cssPath(file)
        mimetype = 'text/css'
      } else {
        url = jsPath(file)
        mimetype = 'application/javascript'
      }
      promises.push(readFilePromise(pathParser.resolve(`res/${file}`)).then((staticFilesContent) => zimCreator.addItem(new StringItem(url, mimetype, '', {}, staticFilesContent))))
    }

    await Promise.all(promises)
    await zimCreator.addRedirection('Article_Two', 'ArticleTwo', 'article2')

    await zimCreator.finishZimCreation()
  })

  afterAll(() => {
    fs.rmSync(testId, { recursive: true })
  })
})
