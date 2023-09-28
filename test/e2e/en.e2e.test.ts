import testWithAllRenders from '../testAllRendersTemplate.js'

describe('e2e test en.wikipedia.org', () => {
  it('Run all renders test', async () => {
    const mwUrl = 'https://en.wikipedia.org'
    const articleList = 'User:Kelson/MWoffliner_CI_reference'
    const format = ''
    await testWithAllRenders(mwUrl, articleList, format)
  })
})
