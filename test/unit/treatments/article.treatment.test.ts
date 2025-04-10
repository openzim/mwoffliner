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
      const { downloader, dump } = await setupScrapeClasses() // en wikipedia
      const _articlesDetail = await downloader.getArticleDetailsIds(['London', 'non-existent-article'])
      const articlesDetail = mwRetToArticleDetail(_articlesDetail)
      const { articleDetailXId } = RedisStore
      await articleDetailXId.flush()
      await articleDetailXId.setMany(articlesDetail)

      const addedArticles: StringItem[] = []

      downloader.setUrlsDirectors(rendererInstance, rendererInstance)

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
        downloader,
        dump,
        true,
        renderer,
      )

      // Successfully scrapped existent articles + placeholder for deleted article
      expect(addedArticles).toHaveLength(2)

      expect([addedArticles[0].title, addedArticles[1].title]).toEqual(expect.arrayContaining(['London','non-existent-article']))

      for (let i = 0; i<=1; i++) {
        
        if (addedArticles[i].title === 'London') {
          const articleDoc = domino.createDocument(addedArticles[i].getContentProvider().feed().toString())

          // Successfully scrapped existent articles
          expect(articleDoc.querySelector('meta[name="geo.position"]')).toBeDefined()
          // Geo Position data is correct
          expect(articleDoc.querySelector('meta[name="geo.position"]')?.getAttribute('content')).toEqual('51.50722222;-0.1275')
        }

        if (addedArticles[i].title === 'non-existent-article') {
          expect(addedArticles[i].getContentProvider().feed().toString()).toContain('Oops. Article not found.')
        }

      }

    })
  }
})
