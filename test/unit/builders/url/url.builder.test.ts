import urlBuilder from '../../../../src/util/builders/url/url.builder.js'

describe('URLBuilder', () => {
  it('should throw an error if domain is not specified', () => {
    expect(() => urlBuilder.setPath('/v1/api').setQueryParams({ param1: 'param1' }).build()).toThrow(new Error('The link must contain a domain'))
  })

  it('should return URL as a string', () => {
    const url = urlBuilder.setDomain('https://localhost:3000').setPath('/v1/api').build()

    expect(url).toBe('https://localhost:3000/v1/api')
  })

  it('should return URL as a URL object', () => {
    const url = urlBuilder.setDomain('https://localhost:3000').setPath('/v1/api').build(true) as URL

    expect(url.href).toBe('https://localhost:3000/v1/api')
  })

  it('should return URL as a URL object with trailing char', () => {
    const url = urlBuilder.setDomain('https://localhost:3000').setPath('/v1/api').build(true, '/') as URL

    expect(url.href).toBe('https://localhost:3000/v1/api/')
  })

  it('should return URL as a string with trailing char', () => {
    const url = urlBuilder.setDomain('https://localhost:3000').setPath('/v1/api').build(false, '/')

    expect(url).toBe('https://localhost:3000/v1/api/')
  })

  it('should return a URL with query params', () => {
    const url = urlBuilder.setDomain('https://localhost:3000').setPath('/v1/api').setQueryParams({ param1: 'param1', param2: 'param2' }).build()

    expect(url).toBe('https://localhost:3000/v1/api?param1=param1&param2=param2')
  })

  it('should append query params to the URL where some query params already exist', () => {
    const url = urlBuilder.setDomain('https://localhost:3000?param1=param1&param2=param2').setQueryParams({ param3: 'param3', param4: 'param4' }, '&').build()

    expect(url).toBe('https://localhost:3000?param1=param1&param2=param2&param3=param3&param4=param4')
  })
})
