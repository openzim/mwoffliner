import domino from 'domino'
import RedisStore from '../../../src/RedisStore.js'
import { StringItem } from '@openzim/libzim'
import { mwRetToArticleDetail } from '../../../src/util/mw-api.js'
import { setupScrapeClasses } from '../../util.js'
import { startRedis, stopRedis } from '../bootstrap.js'
import { saveArticles } from '../../../src/util/saveArticles.js'
import { jest } from '@jest/globals'
import { WikimediaDesktopRenderer } from '../../../src/renderers/wikimedia-desktop.renderer.js'
import { WikimediaMobileRenderer } from '../../../src/renderers/wikimedia-mobile.renderer.js'
import { VisualEditorRenderer } from '../../../src/renderers/visual-editor.renderer.js'
import { RestApiRenderer } from '../../../src/renderers/rest-api.renderer.js'
import { ActionParseRenderer } from '../../../src/renderers/action-parse.renderer.js'
import { RENDERERS_LIST } from '../../../src/util/const.js'
import Downloader from '../../../src/Downloader.js'

jest.setTimeout(10000)

describe('ArticleTreatment', () => {
  beforeAll(startRedis)
  afterAll(stopRedis)

  for (const renderer of RENDERERS_LIST) {
    let rendererInstance
    switch (renderer) {
      case 'VisualEditor':
        rendererInstance = new VisualEditorRenderer()
        break
      case 'WikimediaDesktop':
        rendererInstance = new WikimediaDesktopRenderer()
        break
      case 'WikimediaMobile':
        rendererInstance = new WikimediaMobileRenderer()
        break
      case 'RestApi':
        rendererInstance = new RestApiRenderer()
        break
      case 'ActionParse':
        rendererInstance = new ActionParseRenderer()
        break
      default:
        throw new Error(`Unknown renderer: ${renderer}`)
    }

    test(`Article html processing for ${renderer} render`, async () => {
      const { dump } = await setupScrapeClasses() // en wikipedia
      const title = 'London'
      const _articlesDetail = await Downloader.getArticleDetailsIds([title])
      const articlesDetail = mwRetToArticleDetail(_articlesDetail)
      const { articleDetailXId } = RedisStore
      await articleDetailXId.flush()
      await articleDetailXId.setMany(articlesDetail)

      const addedArticles: StringItem[] = []

      const articleId = 'non-existent-article'
      Downloader.setUrlsDirectors(rendererInstance, rendererInstance)
      const articleUrl = Downloader.getArticleUrl(articleId)

      const articleDetail = {
        title,
        thumbnail: {
          width: 50,
          height: 28,
          source: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/67/London_Skyline_%28125508655%29.jpeg/50px-London_Skyline_%28125508655%29.jpeg',
        },
        revisionId: 1171340841,
        timestamp: '2023-08-20T14:54:01Z',
        coordinates: '51.50722222;-0.1275',
      }

      // TODO: use proper spied (like sinon.js)
      await saveArticles(
        {
          addItem(article: StringItem) {
            if (article.mimeType === 'text/html') {
              addedArticles.push(article)
            }
            return Promise.resolve(null)
          },
        } as any,
        dump,
        true,
        renderer,
      )

      // Successfully scrapped existent articles
      expect(addedArticles).toHaveLength(1)
      expect(addedArticles[0].title).toEqual('London')

      await expect(Downloader.getArticle(articleId, articleDetailXId, rendererInstance, articleUrl, dump, articleDetail, dump.isMainPage(articleId))).rejects.toThrowError('')

      const articleDoc = domino.createDocument(addedArticles.shift().getContentProvider().feed().toString())

      // Successfully scrapped existent articles
      expect(articleDoc.querySelector('meta[name="geo.position"]')).toBeDefined()
      // Geo Position data is correct
      expect(articleDoc.querySelector('meta[name="geo.position"]')?.getAttribute('content')).toEqual('51.50722222;-0.1275')
    })
  }
})
