import urlBuilder from '../../src/util/builders/url/url.builder.js'

describe('URLBuilder', () => {
  it('should throw an error if domain is not specified', () => {
    expect(() => urlBuilder.setPath('/v1/api').setQueryParams({ param1: 'param1' }).build()).toThrow(new Error('The link must contain a domain'))
  })
})
