import moduleURLDirector from '../../../../src/util/builders/url/module.director.js'

describe('ModuleURLDirector', () => {
  describe('buildBasicURL', () => {
    it('should return a module URL with provided path and question mark trailing char', () => {
      const url = moduleURLDirector.buildBasicURL('https://en.m.wikipedia.org/', 'w/reload.php')

      expect(url).toBe('https://en.m.wikipedia.org/w/reload.php?')
    })

    it('should return a module URL with default path and question mark trailing char', () => {
      const url = moduleURLDirector.buildBasicURL('https://en.m.wikipedia.org/', undefined)

      expect(url).toBe('https://en.m.wikipedia.org/w/load.php?')
    })
  })
})
