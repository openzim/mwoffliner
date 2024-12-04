import * as domino from 'domino'

import { Renderer } from '../../../src/renderers/abstract.renderer'

class ConcreteRenderer extends Renderer {
  public async render(renderOpts: any): Promise<any> {
    return Promise.resolve(null)
  }
}

describe('Abstract Renderer', () => {
  let renderer: Renderer
  beforeEach(() => {
    renderer = new ConcreteRenderer()
  })

  describe('collectInlineJs', () => {
    let test_window
    beforeEach(() => {
      // Snippet of an article with nested hidden sections.
      test_window = domino.createWindow(
        `
        <html>
        <head>
          <title>Test Article</title>
        </head>
        <body>
          <div>
            <script>console.log('This is a script tag')</script>
            <div>
              <div>
                <script>console.log('This is another script tag')</script>
              </div>
            </div>
          </div>
          <script>console.log('Final script tag')</script>
        </body>
        </html>`,
        'https://bm.wikipedia.org/api/rest_v1/page/mobile-html/Mali',
      )
    })
    it('should collect all inline scripts in the article', () => {
      const actual = renderer.INTERNAL.collectInlineJs(test_window.document)
      expect(actual).toEqual("console.log('This is a script tag')\nconsole.log('This is another script tag')\nconsole.log('Final script tag')")
    })
  })
})
