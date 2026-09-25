import { mergeFileDetails } from '../../../src/util/FileManager.js'

describe('mergeFileDetails', () => {
  const url100 = 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/ca/Foo.jpg/100px-Foo.jpg'
  const url120 = 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/ca/Foo.jpg/120px-Foo.jpg'

  test('keeps higher resolution URL even when lower resolution URL is displayed wider', () => {
    // see https://github.com/openzim/mwoffliner/issues/2881
    const existing: FileDetail = { url: url120, kind: 'image', width: 120, displayWidth: 100 }
    const detail: FileDetail = { url: url100, kind: 'image', width: 100, displayWidth: 110 }
    expect(mergeFileDetails(existing, detail)).toEqual({ url: url120, kind: 'image', width: 120, displayWidth: 110 })
  })

  test('upgrades to higher resolution URL and keeps highest display width', () => {
    const existing: FileDetail = { url: url100, kind: 'image', width: 100, displayWidth: 110 }
    const detail: FileDetail = { url: url120, kind: 'image', width: 120, displayWidth: 100 }
    expect(mergeFileDetails(existing, detail)).toEqual({ url: url120, kind: 'image', width: 120, displayWidth: 110 })
  })

  test('returns null when nothing changes', () => {
    const existing: FileDetail = { url: url120, kind: 'image', width: 120, displayWidth: 110 }
    const detail: FileDetail = { url: url100, kind: 'image', width: 100, displayWidth: 100 }
    expect(mergeFileDetails(existing, detail)).toBeNull()
  })

  test('ignores unknown display width', () => {
    const existing: FileDetail = { url: url100, kind: 'image', width: 100 }
    const detail: FileDetail = { url: url120, kind: 'image', width: 120 }
    expect(mergeFileDetails(existing, detail)).toEqual({ url: url120, kind: 'image', width: 120 })
  })
})
