import { startRedis, stopRedis } from './bootstrap.js'
import domino from 'domino'
import { rewriteUrl } from '../../src/util/rewriteUrls.js'
import { makeLink, setupScrapeClasses } from '../util.js'
import { articleDetailXId, redirectsXId } from '../../src/stores.js'
import { getArticleIds } from '../../src/util/redirects.js'
import { saveArticles, isMirrored } from '../../src/util/saveArticles.js'
import { ZimArticle } from '@openzim/libzim'
import { mwRetToArticleDetail } from '../../src/util/index.js'
import { jest } from '@jest/globals'

jest.setTimeout(20000)

describe('Styles', () => {
  beforeAll(startRedis)
  afterAll(stopRedis)

  test('Url re-writing', async () => {
    const { downloader, mw, dump } = await setupScrapeClasses() // en wikipedia

    const _articlesDetail = await downloader.getArticleDetailsIds(['London', 'British_Museum', 'Farnborough/Aldershot_built-up_area'])
    const articlesDetail = mwRetToArticleDetail(_articlesDetail)
    await articleDetailXId.flush()
    await articleDetailXId.setMany(articlesDetail)

    const parentArticleId = 'London'
    const complexParentArticleId = 'London/City_Example'

    const $doc = domino.createDocument()
    const $geo = makeLink($doc, 'geo:37.786971,-122.399677', 'mw:ExtLink', 'some geo link')
    const $geoHack = makeLink(
      $doc,
      '//tools.wmflabs.org/geohack/geohack.php?pagename=London&params=51_30_26_N_0_7_39_W_region:GB_type:city(8825000)',
      'mw:ExtLink',
      '51°30′26″N 0°7′39″W',
    )
    const $extHttp = makeLink($doc, 'http://google.com', 'mw:ExtLink', "Google's Homepage (HTTP)")
    const $extHttps = makeLink($doc, 'https://google.com', 'mw:ExtLink', "Google's Homepage (HTTPS)")
    const $extHttpsNoRel = makeLink($doc, 'https://google.com', '', "Google's Homepage (HTTPS)")
    const $extNoProtocol = makeLink($doc, '//google.com', '', "Google's Homepage (no protocol)")
    const $wikiLink = makeLink($doc, '/wiki/British_Museum', '', 'British Museum')
    const $wikiLink2 = makeLink($doc, '/wiki/British_Museum', '', 'British Museum')
    const $wikiLinkWithSlash = makeLink($doc, '/wiki/Farnborough/Aldershot_built-up_area', '', 'Farnborough/Aldershot built-up Area')
    const $nonScrapedWikiLink = makeLink($doc, '/wiki/this_page_does_not_exist', '', 'fake link')
    const $specialMap = makeLink($doc, '/wiki/Special:Map/9/51.51/-0.08/en', '', 'Interactive map outlining London')
    const $hashLink = makeLink($doc, '#cite_note-LAS-150', '', 'The London Air Ambulance')
    const $resourceLink = makeLink($doc, '//upload.wikimedia.org/wikipedia/commons/c/c6/De-Z%C3%BCrich.ogg', '', 'De-Z%C3%BCrich.ogg', 'Zurich', {
      resource: './Media:De-Zürich.ogg',
    })

    await rewriteUrl(complexParentArticleId, mw, dump, $geo)
    // Geo is still a link
    expect($geo.nodeName).toEqual('A')
    // Geo HREF is correct
    expect($geo.getAttribute('href')).toEqual('geo:37.786971,-122.399677')

    await rewriteUrl(complexParentArticleId, mw, dump, $geoHack)
    // GeoHack is still a link
    expect($geoHack.nodeName).toEqual('A')
    // GeoHack HREF is correct
    expect($geoHack.getAttribute('href')).toEqual('geo:51.507222222222225,-0.1275')

    await rewriteUrl(complexParentArticleId, mw, dump, $extHttp)
    // extHttp is still a link
    expect($extHttp.nodeName).toEqual('A')
    // extHttp HREF is correct
    expect($extHttp.getAttribute('href')).toEqual('http://google.com')

    await rewriteUrl(complexParentArticleId, mw, dump, $extHttps)
    // extHttps is still a link
    expect($extHttps.nodeName).toEqual('A')
    // extHttps HREF is correct
    expect($extHttps.getAttribute('href')).toEqual('https://google.com')

    await rewriteUrl(complexParentArticleId, mw, dump, $extNoProtocol)
    // extNoProtocol is still a link
    expect($extNoProtocol.nodeName).toEqual('A')
    // $extNoProtocol HREF has HTTPS Protocol
    expect($extNoProtocol.getAttribute('href')).toEqual('https://google.com')

    await rewriteUrl(complexParentArticleId, mw, dump, $extHttpsNoRel)
    // extHttpsNoRel is still a link
    expect($extHttpsNoRel.nodeName).toEqual('A')
    // extHttpsNoRel HREF is correct
    expect($extHttpsNoRel.getAttribute('href')).toEqual('https://google.com')

    await rewriteUrl(parentArticleId, mw, dump, $wikiLink)
    // wikiLink is still a link with simple parent id
    expect($wikiLink.nodeName).toEqual('A')
    // wikiLink HREF is correct with simple parent id
    expect($wikiLink.getAttribute('href')).toEqual('British_Museum')

    await rewriteUrl(complexParentArticleId, mw, dump, $wikiLink2)
    // wikiLink is still a link with complex parent id
    expect($wikiLink2.nodeName).toEqual('A')
    // wikiLink HREF is correct with complex parent id
    expect($wikiLink2.getAttribute('href')).toEqual('../../A/British_Museum')

    await rewriteUrl(complexParentArticleId, mw, dump, $wikiLinkWithSlash)
    // wikiLinkWithSlash is still a link
    expect($wikiLinkWithSlash.nodeName).toEqual('A')
    // wikiLinkWithSlash HREF is correct
    expect($wikiLinkWithSlash.getAttribute('href')).toEqual('../../A/Farnborough/Aldershot_built-up_area')

    await rewriteUrl(complexParentArticleId, mw, dump, $specialMap)
    // specialMap is still a link
    expect($specialMap.nodeName).toEqual('A')
    // specialMap HREF is correct
    expect($specialMap.getAttribute('href')).toEqual('geo:51.51,-0.08')

    await rewriteUrl(complexParentArticleId, mw, dump, $hashLink)
    // hashLink is still a link
    expect($hashLink.nodeName).toEqual('A')
    // hashLink HREF is correct
    expect($hashLink.getAttribute('href')).toEqual('#cite_note-LAS-150')

    await rewriteUrl(complexParentArticleId, mw, dump, $nonScrapedWikiLink)
    // nonScrapedWikiLink has been deleted
    expect($nonScrapedWikiLink.parentElement).toBeNull()

    await rewriteUrl(complexParentArticleId, mw, dump, $resourceLink)
    // resourceLink is still a link
    expect($resourceLink.nodeName).toEqual('A')
    // resourceLink has been re-written
    expect($resourceLink.getAttribute('href')).toEqual('../../I/De-Z%C3%BCrich.ogg')
  })

  test('e2e url rewriting', async () => {
    await articleDetailXId.flush()
    await redirectsXId.flush()
    const { downloader, mw, dump } = await setupScrapeClasses() // en wikipedia
    await downloader.checkCapabilities()
    await downloader.setBaseUrls()

    await getArticleIds(downloader, mw, '', ['London', 'British_Museum', 'Natural_History_Museum,_London', 'Farnborough/Aldershot_built-up_area'])

    let LondonArticle: typeof ZimArticle

    await saveArticles(
      {
        addArticle(article: typeof ZimArticle) {
          if (article.title === 'London') {
            LondonArticle = article
          }
          return Promise.resolve(null)
        },
      } as any,
      downloader,
      mw,
      dump,
    )

    const html = LondonArticle.bufferData.toString()
    const doc = domino.createDocument(html)

    const relevantAs = Array.from(doc.querySelectorAll('a')).filter((a) => !a.hash && !a.className.includes('external') && !a.host && a.getAttribute('href'))

    const linkedArticleIds = relevantAs.map((a) => decodeURIComponent(`${a.getAttribute('href')}`))
    for (const aId of linkedArticleIds) {
      const article = await isMirrored(aId)
      expect(article).toBeDefined()
    }
  })
})
