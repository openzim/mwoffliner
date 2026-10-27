import { readFileSync } from 'fs'
import pathParser from 'path'
import vm from 'vm'
import { fileURLToPath } from 'url'
import { getPageImageTileRatio, makePageImageTile } from '../../../src/util/pageListMainPage.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = pathParser.dirname(__filename)

// Runs the welcome page script outside a browser and returns its layout functions
function loadPageListHome() {
  const window: any = {}
  const document = { addEventListener: () => undefined }
  vm.runInNewContext(readFileSync(pathParser.resolve(__dirname, '../../../res/page_list_home.js'), 'utf8'), { window, document })
  return window.pageListHome
}

const pageWithThumbnail = (width?: number, height?: number) =>
  ({
    title: 'Foo_bar',
    internalThumbnailUrl: '_assets_/foo.jpg',
    ...(width !== undefined ? { thumbnail: { source: 'https://example.org/foo.jpg', width, height } } : {}),
  }) as PageDetail

describe('welcome page tiles', () => {
  test.each([
    [400, 300, 1.3333],
    [300, 300, 1],
    [500, 250, 2],
    [100, 500, 0.5],
    [500, 100, 2],
    [300, 0, 1.3333],
    [undefined, undefined, 1.3333],
  ])('tile ratio of a %sx%s thumbnail is %s', (width, height, expected) => {
    expect(getPageImageTileRatio(pageWithThumbnail(width, height))).toBe(expected)
  })

  test('tile carries its ratio and a decorative image', () => {
    const tile = makePageImageTile({} as any, pageWithThumbnail(160, 90))
    expect(tile).toContain('class="item" href="Foo_bar" style="--r:1.7778"')
    expect(tile).toContain('<img loading="lazy" src="_assets_/foo.jpg" alt="" />')
    expect(tile).toContain('<figcaption>Foo_bar</figcaption>')
  })
})

describe('welcome page justified rows', () => {
  const { partition, justify } = loadPageListHome()

  test('splits ratios into rows with sums as equal as possible, keeping the order', () => {
    expect(partition([1, 1, 1, 1], 2)).toEqual([2, 2])
    expect(partition([3, 1, 1, 1], 2)).toEqual([1, 3])
    expect(partition([1, 1, 1], 1)).toEqual([3])
  })

  // 100 tiles from 1:2 to 2:1, in a fixed pseudo-random order
  const ratios: number[] = []
  for (let i = 0; i < 100; i++) ratios.push([0.5, 0.6667, 0.75, 1, 1.3333, 1.5, 1.7778, 2][(i * 7) % 8])

  test.each([360, 768, 1280, 1920])('every row, the last one included, fills %spx exactly', (width) => {
    const cols = width < 768 ? 2 : width < 1024 ? 3 : 4
    const rowHeight = (0.75 * width) / cols
    const boxes = justify(ratios, width, rowHeight)
    const total = ratios.reduce((a, b) => a + b, 0)
    const sizes = partition(ratios, Math.round((total * rowHeight) / width))
    expect(boxes).toHaveLength(ratios.length)
    let start = 0
    for (const size of sizes) {
      const row = boxes.slice(start, start + size)
      expect(row.reduce((sum, box) => sum + box.w, 0)).toBe(width)
      expect(new Set(row.map((box) => box.h)).size).toBe(1)
      for (const box of row) expect(Number.isInteger(box.w) && Number.isInteger(box.h)).toBe(true)
      start += size
    }
  })

  test('a single tile takes the whole width', () => {
    expect(justify([0.5], 300, 200)).toEqual([{ w: 300, h: 600 }])
  })
})
