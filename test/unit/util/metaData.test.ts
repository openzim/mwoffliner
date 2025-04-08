import { byGrapheme } from 'split-by-grapheme'

describe('Test metadata utilities', () => {
  describe('Count graphemes', () => {
    test('simple latin', async () => {
      expect('title'.split(byGrapheme).length).toBe(5)
    })

    test('multiletter graphemes', async () => {
      expect('में'.split(byGrapheme).length).toBe(1)
    })

    test('multiletter graphemes', async () => {
      expect('विकी मेड मेडिकल इनसाइक्लोपीडिया हिंदी में'.split(byGrapheme).length).toBe(24)
    })
  })
})
