import { URL } from 'url'
import tmp from 'tmp'
import pathParser from 'path'
import { sanitize_customFlavour } from '../../src/sanitize-argument.js'
import {
  encodeArticleIdForZimHtmlUrl,
  interpolateTranslationString,
  getFullUrl,
  getMediaBase,
  normalizeMwResponse,
  isWebpCandidateImageMimeType,
  cleanupAxiosError,
  extractArticleList,
  mkdirPromise,
  writeFilePromise,
  validateMetadata,
} from '../../src/util/index.js'
import { testHtmlRewritingE2e } from '../util.js'
import axios from 'axios'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { jest } from '@jest/globals'
import fs from 'fs'
import rimraf from 'rimraf'
import Downloader from '../../src/Downloader.js'
import MediaWiki from '../../src/MediaWiki.js'
import { config } from '../../src/config.js'

jest.setTimeout(10000)

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

describe('Utils', () => {
  MediaWiki.base = 'https://en.wikipedia.org' // Mandatory setting for proper downloader initialization
  beforeAll(async () => {
    Downloader.init = { uaString: `${config.userAgent} (contact@kiwix.org)`, speed: 1, reqTimeout: 1000 * 60, webp: true, optimisationCacheUrl: '' }
  })

  test('util -> interpolateTranslationString', async () => {
    expect(interpolateTranslationString('Hello world', {})).toEqual('Hello world')
    expect(interpolateTranslationString('Hello ${name}', { name: 'John' })).toEqual('Hello John')
    expect(
      interpolateTranslationString('Hello ${name} ${lastname}, bye ${name}', {
        name: 'John',
        lastname: 'Smith',
      }),
    ).toEqual('Hello John Smith, bye John')
  })

  test('Encoding ArticleId for Zim HTML Url', async () => {
    const articles = [
      'Que_faire_?',
      'Que_faire_%3F',
      'Que_faire_?_(Lénine)',
      'Que_faire_%3F_(L%C3%A9nine)',
      'Random_#hashtag',
      'Random_%23hashtag',
      "Guidelines:Règles_d'édition",
      "Guidelines%3AR%C3%A8gles_d'%C3%A9dition",
      'Avanti!',
      'Avanti!',
      'McCormick_Tribune_Plaza_&_Ice Rink',
      'McCormick_Tribune_Plaza_%26_Ice%20Rink',
      '2_+_2_=_5',
      '2_%2B_2_%3D_5',
      "Guidelines:Règles d'édition",
      "Guidelines%3AR%C3%A8gles%20d'%C3%A9dition",
      'something/random/todo',
      'something/random/todo',
      'Michael_Jackson',
      'Michael_Jackson',
      '/dev/null',
      './/dev/null',
      '0',
      '0',
      undefined,
      undefined,
      null,
      null,
    ]

    while (articles.length) {
      const unencoded = articles.shift()
      const encoded = articles.shift()
      expect(`${encoded}`).toEqual(encodeArticleIdForZimHtmlUrl(`${unencoded}`))
    }
  })

  test('wikitext comparison', async () => {
    testHtmlRewritingE2e(
      'An [[isolated system]] remains the system is free.',
      '<p id="mwAg">An <a rel="mw:WikiLink" href="./Isolated_system" title="Isolated system" id="mwAw">isolated system</a> remains the system is free.</p>',
    )
  })

  test('Get full URL', async () => {
    // Full URL for styles
    expect(getFullUrl('/w/load.php?lang=bm&modules=site.styles&only=styles&skin=vector', new URL('https://bm.wikipedia.org/'))).toEqual(
      'https://bm.wikipedia.org/w/load.php?lang=bm&modules=site.styles&only=styles&skin=vector',
    )

    // Full URL for image
    expect(
      getFullUrl(
        '/w/resources/src/mediawiki.skinning/images/spinner.gif?ca65b',
        new URL(
          'https://bm.wikipedia.org/w/load.php?lang=bm&modules=ext.uls.interlanguage%7Cext.visualEditor.desktopArticleTarget.noscript%7Cext.wikimediaBadges%7Cskins.vector.styles.legacy%7Cwikibase.client.init&only=styles&skin=vector',
        ),
      ),
    ).toEqual('https://bm.wikipedia.org/w/resources/src/mediawiki.skinning/images/spinner.gif?ca65b')

    // Full Url for relative path with skipping one file
    expect(getFullUrl('./-/mw/jsConfigVars.js', new URL('https://bm.wikipedia.org/'))).toEqual('https://bm.wikipedia.org/-/mw/jsConfigVars.js')

    // Full Url for relative path with skipping one folder
    expect(getFullUrl('../-/mw/jsConfigVars.js', 'https://bm.wikipedia.org/')).toEqual('https://bm.wikipedia.org/-/mw/jsConfigVars.js')

    // Full Url when base and url both strtas with http/s
    expect(getFullUrl('https://wikimedia.org/api/rest_v1/media/math/render/svg/34cbb1e27dae0c04fc794a91f2aa001aca7054c1', 'https://en.wikipedia.org/')).toEqual(
      'https://wikimedia.org/api/rest_v1/media/math/render/svg/34cbb1e27dae0c04fc794a91f2aa001aca7054c1',
    )
  })

  test('Custom flavour path', async () => {
    // checks in current working directory.
    const tmpObj = tmp.fileSync({ postfix: '.js' })
    process.chdir(pathParser.resolve(tmpObj.name, '../'))

    // Custom flavour in working directory.
    expect(sanitize_customFlavour(tmpObj.name)).toEqual(pathParser.resolve(process.cwd(), tmpObj.name))

    // checks in extension directory.
    expect(sanitize_customFlavour('wiktionary_fr.js')).toEqual(pathParser.resolve(__dirname, '../../extensions/wiktionary_fr.js'))

    // Custom flavour in extension directory without js extension.
    expect(sanitize_customFlavour('wiktionary_fr')).toEqual(pathParser.resolve(__dirname, '../../extensions/wiktionary_fr.js'))

    // checks in absolute path.
    expect(sanitize_customFlavour(pathParser.resolve(__dirname, '../../extensions/wiktionary_fr.js'))).toEqual(pathParser.resolve(__dirname, '../../extensions/wiktionary_fr.js'))

    // Negative test for absolute path.
    expect(sanitize_customFlavour(pathParser.resolve(__dirname, '../../extensions/negativeTest.js'))).toBeNull()

    // negative scenario
    expect(sanitize_customFlavour('wrongCustomFlavour.js')).toBeNull()
  })

  test('getMediaBase tests', async () => {
    // Thumbs
    // Thumb 1
    expect(getMediaBase('https://upload.wikimedia.org/wikipedia/commons/thumb/3/39/Westminstpalace.jpg/220px-Westminstpalace.jpg', true)).toEqual('Westminstpalace.jpg')
    // No thumb
    expect(getMediaBase('https://upload.wikimedia.org/wikipedia/commons/3/39/Westminstpalace.jpg', true)).toEqual('Westminstpalace.jpg')
    // SVG
    expect(getMediaBase('https://upload.wikimedia.org/wikipedia/commons/0/0d/VFPt_Solenoid_correct2.svg', true)).toEqual('VFPt_Solenoid_correct2.svg')
    // SVG PNG thumb
    expect(getMediaBase('https://upload.wikimedia.org/wikipedia/commons/thumb/0/0d/VFPt_Solenoid_correct2.svg/120px-VFPt_Solenoid_correct2.svg.png', true)).toEqual(
      'VFPt_Solenoid_correct2.svg.png',
    )
    // Video poster
    expect(
      getMediaBase(
        'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b7/S6-Dendritic_Cells_with_Conidia_in_Collagen.ogv/120px--S6-Dendritic_Cells_with_Conidia_in_Collagen.ogv.jpg',
        true,
      ),
    ).toEqual('S6-Dendritic_Cells_with_Conidia_in_Collagen.ogv.jpg')
    // Escaped UR
    expect(getMediaBase('https://upload.wikimedia.org/wikipedia/commons/c/c6/De-Z%C3%BCrich.ogg', false)).toEqual('De-Zürich.ogg')
    // Long thumb
    expect(
      getMediaBase(
        'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5c/US_Navy_070406-N-2959L-756_Members_of_USS_Ronald_Reagan_%28CVN_76%29_First_Class_Association_prepare_and_put_toppings_on_pizzas_in_the_galley_as_part_of_a_special_dinner_prepared_for_the_crew.jpg/169px-thumbnail.jpg',
        true,
      ),
    ).toEqual(
      'US_Navy_070406-N-2959L-756_Members_of_USS_Ronald_Reagan_(CVN_76)_First_Class_Association_prepare_and_put_toppings_on_pizzas_in_the_galley_as_part_of_a_special_dinner_prepared_for_the_crew.jpg',
    )
    // Long thumb with SVG PNG
    expect(
      getMediaBase(
        'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5c/US_Navy_070406-N-2959L-756_Members_of_USS_Ronald_Reagan_%28CVN_76%29_First_Class_Association_prepare_and_put_toppings_on_pizzas_in_the_galley_as_part_of_a_special_dinner_prepared_for_the_crew.svg/169px-thumbnail.svg.png',
        true,
      ),
    ).toEqual(
      'US_Navy_070406-N-2959L-756_Members_of_USS_Ronald_Reagan_(CVN_76)_First_Class_Association_prepare_and_put_toppings_on_pizzas_in_the_galley_as_part_of_a_special_dinner_prepared_for_the_crew.svg.png',
    )

    // Latex (equations)
    expect(getMediaBase('https://wikimedia.org/api/rest_v1/media/math/render/svg/da47d67ac8dcb0be8b68d7bfdc676d9ce9bf1606', true)).toEqual(
      'da47d67ac8dcb0be8b68d7bfdc676d9ce9bf1606.svg',
    )

    // WikiHiero (hieroglyphs)
    // WikiHiero png with URL args
    expect(getMediaBase('https://en.wikipedia.org/w/extensions/wikihiero/img/hiero_G1.png?4d556', false)).toEqual('hiero_G1.png')
    // WikiHiero png without URL args
    expect(getMediaBase('https://en.wikipedia.org/w/extensions/wikihiero/img/hiero_G1.png', false)).toEqual('hiero_G1.png')

    // Score - is default behaviour
    expect(getMediaBase('https://upload.wikimedia.org/score/6/c/6clze8fxoo65795idk91426rskovmgp/6clze8fx.png', false)).toEqual('012a83318ce8d3a438dbed3127b9e339.png')

    // Graphoid (charts) - is default behaviour
    expect(
      getMediaBase('https://en.wikipedia.org/api/rest_v1/page/graph/png/COVID-19_pandemic_in_the_United_Kingdom/0/28fe8c45f73e8cc60d45086655340f49cdfd37d0.png', true),
    ).toEqual('43ffd82a8ffc4755312c22950fde7ac5.png')

    // Fandom
    expect(
      getMediaBase(
        'https://static.wikia.nocookie.net/minecraft_de_gamepedia/images/e/ee/Diamantschwert_%28Dungeons%29.png/revision/latest/scale-to-width-down/60?cb=20200409173531',
        true,
      ),
    ).toEqual('Diamantschwert_(Dungeons).png')

    // Default behaviour
    expect(
      getMediaBase(
        'https://maps.wikimedia.org/img/osm-intl,9,52.2789,8.0431,300x300.png?lang=ar&amp;domain=ar.wikipedia.org&amp;title=%D8%A3%D9%88%D8%B3%D9%86%D8%A7%D8%A8%D8%B1%D9%88%D9%83&amp;groups=_0a30d0118ec7c477895dffb596ad2b875958c8fe',
        true,
      ),
    ).toEqual('589fd4e3821c15d4fcebcedf2effd5b0.png')
  })

  test('isWebpCandidate by mime type', async () => {
    expect(isWebpCandidateImageMimeType('image/jpeg')).toBeTruthy()
    expect(isWebpCandidateImageMimeType('image/png')).toBeTruthy()
    expect(isWebpCandidateImageMimeType('image/gif')).toBeFalsy()
    expect(isWebpCandidateImageMimeType('application/json')).toBeFalsy()
    expect(isWebpCandidateImageMimeType('image/svg+xml')).toBeFalsy()
    expect(isWebpCandidateImageMimeType('image/svg')).toBeFalsy()
  })

  test('No title normalisation', async () => {
    const resp = await axios.get<MwApiResponse>(
      'https://en.wiktionary.org/w/api.php?action=query&format=json&prop=redirects|revisions|pageimages&rdlimit=max&rdnamespace=0&redirects=true&titles=constructor&formatversion=2',
      { responseType: 'json' },
    )
    const normalizedObject = normalizeMwResponse(resp.data.query)
    // normalizeMwResponse returns title constructor
    expect(Object.keys(normalizedObject)[0]).toEqual('constructor')
  })

  test('Cleanup AxiosError function', async () => {
    const result = {
      name: 'AxiosError',
      message: 'Request failed with status code 403',
      url: 'https://en.wikibooks.org/api/rest_v1/page/html/World_History%2FThe_Rise_of_Dictatorship_and_Totalitarianism%2FQuick_Quiz/4225685',
      status: 403,
      responseType: undefined,
      data: {
        errorKey: 'rest-permission-denied-revision',
        httpCode: 403,
        httpReason: 'Forbidden',
        messageTranslations: {
          en: "User doesn't have access to the requested revision (4225685).",
        },
        type: 'MediaWikiError/Forbidden',
        title: 'rest-permission-denied-revision',
        method: 'get',
        detail: "User doesn't have access to the requested revision (4225685).",
        uri: '/w/rest.php/v1/revision/4225685/html',
      },
    }
    try {
      await axios.get('https://en.wikibooks.org/api/rest_v1/page/html/World_History%2FThe_Rise_of_Dictatorship_and_Totalitarianism%2FQuick_Quiz/4225685')
      fail('it should not reach here')
    } catch (err) {
      const cleanupedError = cleanupAxiosError(err)
      expect(cleanupedError).toEqual(result)
    }
  })

  describe('extractArticleList', () => {
    const now = new Date()
    const dirname = path.join(process.cwd(), `mwo-test-${+now}`)

    const argumentsList = ['testString1', 'testString2', 'testString3']
    const anotherArgumentsList = ['testString4', 'testString5', 'testString6']
    const filePath = path.join(dirname, 'articles1.txt')
    const anotherFilePath = path.join(dirname, 'articles2.txt')

    beforeAll(async () => {
      await mkdirPromise(dirname)
      await writeFilePromise(filePath, argumentsList.join('\n'))
      await writeFilePromise(anotherFilePath, anotherArgumentsList.join('\n'))
    })

    afterAll(() => {
      rimraf.sync(dirname)
    })

    test('One string as parameter', async () => {
      const result: string[] = await extractArticleList('testString')
      expect(result).toEqual(['testString'])
    })

    test('Comma separated strings as parameter', async () => {
      const result: string[] = await extractArticleList(argumentsList.join(','))
      expect(result).toEqual(argumentsList)
    })

    test('Filename string as parameter', async () => {
      const result: string[] = await extractArticleList(filePath)
      expect(result).toEqual(argumentsList)
    })

    test('Comma separated filenames string as parameter', async () => {
      const result: string[] = await extractArticleList(`${filePath},${anotherFilePath}`)
      expect(result.sort()).toEqual(argumentsList.concat(anotherArgumentsList))
    })

    test('URL as parameter', async () => {
      jest.spyOn(Downloader, 'request').mockResolvedValue({
        data: fs.createReadStream(filePath),
        status: 200,
        statusText: 'OK',
        headers: null,
        config: null,
      })
      const result: string[] = await extractArticleList('http://test.com/strings')
      expect(result).toEqual(argumentsList)
    })

    test("Comma separated URL's as parameter", async () => {
      jest.spyOn(Downloader, 'request').mockResolvedValueOnce({
        data: fs.createReadStream(filePath),
        status: 200,
        statusText: 'OK',
        headers: null,
        config: null,
      })
      jest.spyOn(Downloader, 'request').mockResolvedValueOnce({
        data: fs.createReadStream(anotherFilePath),
        status: 200,
        statusText: 'OK',
        headers: null,
        config: null,
      })
      const result: string[] = await extractArticleList('http://test.com/strings,http://test.com/another-strings')
      expect(result.sort()).toEqual(argumentsList.concat(anotherArgumentsList))
    })

    test('The parameter starts from HTTP but it is not the URL', async () => {
      const result: string[] = await extractArticleList('http-test')
      expect(result).toEqual(['http-test'])
    })

    test('Error if trying to get articleList from wrong URL ', async () => {
      jest.spyOn(Downloader, 'request').mockRejectedValue({})
      await expect(extractArticleList('http://valid-wrong-url.com/')).rejects.toThrow('Failed to read articleList from URL: http://valid-wrong-url.com/')
    })
  })

  describe('metaData', () => {
    const pngImage = fs.readFileSync(`${__dirname}/mock/1x1.png`)

    const minimumValidMetadata = {
      Creator: 'the creator',
      Description: 'test Description',
      Language: 'eng,ita',
      Publisher: 'test Publisher',
      Title: 'विकी मेड मेडिकल इनसाइक्लोपीडिया हिंदी मेंfविविविमे',
      'Illustration_48x48@1': pngImage,
    }

    test('validate valid metadata', () => {
      expect(() => validateMetadata(minimumValidMetadata)).not.toThrowError()
    })

    test('validate with unicode chars', () => {
      const metaData = {
        ...minimumValidMetadata,
        Description: '😎 Emoji, ❤ Hearts, 💲 Currencies, → Arrows, ☆ Stars',
      }
      expect(() => validateMetadata(metaData)).not.toThrowError()
    })

    test('validate empty string', () => {
      const metaData = {
        ...minimumValidMetadata,
        Creator: '',
      }
      expect(() => validateMetadata(metaData)).toThrow('Metadata "Creator" is required')
    })

    test('validate missed metaData key', () => {
      const metaData = {
        ...minimumValidMetadata,
      }
      delete metaData.Description
      expect(() => validateMetadata(metaData)).toThrow('Metadata "Description" is required')
    })

    test('validate long Description', () => {
      const metaData = {
        ...minimumValidMetadata,
        Description: 'test Description test Description test Description test Description test Description test Description ',
      }
      expect(() => validateMetadata(metaData)).toThrow('MetaData Description: must NOT have more than 80 graphemes')
    })

    test('validate long Title', () => {
      const metaData = {
        ...minimumValidMetadata,
        Title: 'विकी मेड मेडिकल इनसाइक्लोपीडिया हिंदी मेंfविविविमेविमेवि',
      }
      expect(() => validateMetadata(metaData)).toThrow('MetaData Title: must NOT have more than 30 graphemes')
    })

    test('validate string with line brake', () => {
      const metaData = {
        ...minimumValidMetadata,
        Description: `test
        Description
        test`,
      }
      expect(() => validateMetadata(metaData)).not.toThrowError()
    })

    test('validate null value', () => {
      const metaData = {
        ...minimumValidMetadata,
        Creator: null,
      }
      expect(() => validateMetadata(metaData)).toThrow('MetaData Creator: must be string')
    })

    test('validate undefined value', () => {
      const metaData = {
        ...minimumValidMetadata,
        Description: undefined,
      }
      expect(() => validateMetadata(metaData)).toThrow('Metadata "Description" is required')
    })

    test('validate Object value', () => {
      const metaData = {
        ...minimumValidMetadata,
        Description: { key: 'value' },
      }
      expect(() => validateMetadata(metaData)).toThrow('MetaData Description: must be string')
    })

    test('validate Array value', () => {
      const metaData = {
        ...minimumValidMetadata,
        Description: [1, 2, 3],
      }
      expect(() => validateMetadata(metaData)).toThrow('MetaData Description: must be string')
    })

    test('validate Boolean value', () => {
      const metaData = {
        ...minimumValidMetadata,
        Description: true,
      }
      expect(() => validateMetadata(metaData)).toThrow('MetaData Description: must be string')
    })

    test('validate NaN value', () => {
      const metaData = {
        ...minimumValidMetadata,
        Description: NaN,
      }
      expect(() => validateMetadata(metaData)).toThrow('MetaData Description: must be string')
    })

    test('validate wrong language format', () => {
      const metaDataLangTest = {
        ...minimumValidMetadata,
        Language: 'en',
      }
      expect(() => validateMetadata(metaDataLangTest)).toThrow('MetaData Language: must match pattern \"^\\w{3}(,\\w{3})*$\"') // prettier-ignore

      const metaData = {
        ...minimumValidMetadata,
        Language: 'en,it',
      }
      expect(() => validateMetadata(metaData)).toThrow('MetaData Language: must match pattern \"^\\w{3}(,\\w{3})*$\"') // prettier-ignore
    })

    test('validate wrong illustration', () => {
      const metaData = {
        ...minimumValidMetadata,
        'Illustration_48x48@1': 'text is not png',
      }
      expect(() => validateMetadata(metaData)).toThrow('MetaData Illustration_48x48@1: must match regex pattern')
    })
  })
})
