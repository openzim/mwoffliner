import urlHelper from '../../../src/util/url.helper.js'

describe('URL helper tests', () => {
  test('Simple', () => {
    const originalUrl = 'https://en.wikipedia.org/w/skins/Vector/resources/skins.vector.styles/images/link-external-small-ltr-progressive.svg?fb64d'
    const serialized = urlHelper.serializeUrl(originalUrl)
    expect(serialized).toMatch(/_\d+_\/w\/skins\/Vector\/resources\/skins.vector.styles\/images\/link-external-small-ltr-progressive.svg\?fb64d/)
    expect(urlHelper.deserializeUrl(serialized)).toBe(originalUrl)
  })
})
