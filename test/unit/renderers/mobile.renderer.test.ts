import * as domino from 'domino'

import { WikimediaMobileRenderer } from '../../../src/renderers/wikimedia-mobile.renderer'
import exp from 'constants'

describe('mobile renderer', () => {
  describe('unhiding sections', () => {
    let test_window
    beforeEach(() => {
      // Snippet of an article with nested hidden sections.
      test_window = domino.createWindow(
        `
        <section data-mw-section-id="3" style="display: none;">
        <div class="pcs-edit-section-header v2">
          <h2 id="Dugu_kilatogo" class="pcs-edit-section-title">Dugu kilatogo</h2>
          <span class="pcs-edit-section-link-container">
            <a href="/w/index.php?title=Mali&amp;action=edit&amp;section=3" data-id="3" data-action="edit_section" aria-labelledby="pcs-edit-section-aria-normal" class="pcs-edit-section-link"></a>
          </span>
        </div>
        <p>Mali kila ...</p>

        <section data-mw-section-id="4" style="display: none;"><h3 id="Nafasɔrɔsira"><span id="Nafas.C9.94r.C9.94sira"></span>Nafasɔrɔsira</h3>
          <figure class="mw-halign-right pcs-widen-image-ancestor" typeof="mw:File/Thumb">
          <ul><li>Bagan kumaba là millions mugan ni fila dɛ fɛrɛ san kɔnɔ.</li>
              <li>Sanu bɛ Mali la fa ni dɛ diɔyɔrɔ filana dɛ farifina diɔrɔ ka ni cory ni mangoro yɛ u ka fin fɛrɛ ta yɛ Mali kɔnɔ.</li></ul>
        </section>

        <p>Mali</p>
        </section>
        `,
        'https://bm.wikipedia.org/api/rest_v1/page/mobile-html/Mali',
      )
    })

    test('it removes the hidden class from sections', async () => {
      const mobileRenderer = new WikimediaMobileRenderer()

      const actual = mobileRenderer.INTERNAL.unhideSections(test_window.document)
      const sections = actual.querySelectorAll('section')

      expect(sections.length).toBe(2)
      expect(sections[0].style.display).toBe('')
      expect(sections[1].style.display).toBe('')
    })
  })

  describe('image converter', () => {
    test('it converts lazy load to images with the proper sizes', async () => {
      const test_window = domino.createWindow(
        `
        <figure typeof="mw:File/Thumb" class="pcs-widen-image-ancestor">
          <a href="./Fichier:Bamako_et_fleuve_Niger.jpg" class="mw-file-description pcs-widen-image-ancestor">
            <span class="mw-file-element pcs-widen-image-override pcs-lazy-load-placeholder pcs-lazy-load-placeholder-pending"
              style="width: 320px;" data-class="mw-file-element pcs-widen-image-override"
              data-src="//upload.wikimedia.org/wikipedia/commons/thumb/8/8f/Bamako_et_fleuve_Niger.jpg/320px-Bamako_et_fleuve_Niger.jpg"
              data-srcset="//upload.wikimedia.org/wikipedia/commons/thumb/8/8f/Bamako_et_fleuve_Niger.jpg/480px-Bamako_et_fleuve_Niger.jpg 1.5x"
              data-width="320" data-height="241" data-data-file-width="600" data-data-file-height="450"
              data-data-file-original-src="//upload.wikimedia.org/wikipedia/commons/thumb/8/8f/Bamako_et_fleuve_Niger.jpg/250px-Bamako_et_fleuve_Niger.jpg"
            >
              <span style="padding-top: 75.3125%;"></span>
            </span>
          </a>
          <figcaption>Bamako</figcaption>
        </figure>
        <figure typeof="mw:File/Thumb" class="pcs-widen-image-ancestor">
          <a href="./Fichier:Bamako_bridge2.jpg" class="mw-file-description pcs-widen-image-ancestor">
            <span class="mw-file-element pcs-widen-image-override pcs-lazy-load-placeholder pcs-lazy-load-placeholder-pending"
              style="width: 640px;" data-class="mw-file-element pcs-widen-image-override"
              data-src="//upload.wikimedia.org/wikipedia/commons/thumb/2/20/Bamako_bridge2.jpg/640px-Bamako_bridge2.jpg"
              data-width="640" data-height="428" data-data-file-width="800" data-data-file-height="533"
              data-data-file-original-src="//upload.wikimedia.org/wikipedia/commons/thumb/2/20/Bamako_bridge2.jpg/250px-Bamako_bridge2.jpg"
            >
              <span style="padding-top: 66.875%;"></span>
            </span>
          </a>
          <figcaption> Bamako Pont, mi bɛ Niger baw kan</figcaption>
        </figure>

        <p>
          San 2021 mɔgɔ 3 000 000 dɛ tun sigin len bɛ Mali faba kɔnɔ. An bɛ yoro mi nan farafina be kono Bamakɔ fanga wili tɔgɔ ka bɔ ni bɛɛ ta ye. wa
          dumia kɔnɔ a bɛ la wɔrɔ dugu la dɛ la singɛ munu la
        </p>

        <p><b>bamakɔ</b> dɛ yɛ ka famgadɔda yɛ.wa nafa ka bɔ a lamini mara bɛ ma </p>

        <p>
          Bamako faaba kila nɛ dɔ ni <b>ki</b> woro dɛ yɛ. ni o niɛmogo tɔgɔ IBRAHIMA N’DIAYE ni ɔ ba fɔ ɔ ma maire
          Kinw minu bɛ Bamakɔ kɔnɔ:
        </p>
        <ul>
          <li>Hippɔdrɔme (tɔgɔkɔrɔ milliɔnki)</li>
          <li>Korofina</li>
          <li>Badalabugu</li>
          <li>Bamakɔ Kura</li>
          <li>Jikoroni</li>
          <li>Bakɔ jikɔrɔni (= derrière le fleuve)</li>
          <li>Kinsanbugu</li>
          <li>Amdalayɛ</li>
          <li>Sabalibugu</li>
          <li>Titibugu</li>
          <li>Lafiabugu</li>
          <li>Badalabugu</li>
          <li>Torokɔrɔbugu</li>
          <li>Quartier du fleuve</li>
        </ul>`,
        'http://bm.wikipedia.org/api/rest_v1/page/mobile-html/BamakBamakɔ',
      )

      const mobileRenderer = new WikimediaMobileRenderer()

      const actual = mobileRenderer.INTERNAL.convertLazyLoadToImages(test_window.document)
      const spans = actual.querySelectorAll('.pcs-lazy-load-placeholder')
      const imgs = actual.querySelectorAll('img')

      expect(spans.length).toBe(0)
      expect(imgs.length).toBe(2)
      expect(imgs[0].src).toEqual('https://upload.wikimedia.org/wikipedia/commons/thumb/8/8f/Bamako_et_fleuve_Niger.jpg/250px-Bamako_et_fleuve_Niger.jpg')
      expect(imgs[0].width).toEqual(250)
      expect(imgs[0].height).toEqual(188)
      expect(imgs[1].src).toEqual('https://upload.wikimedia.org/wikipedia/commons/thumb/2/20/Bamako_bridge2.jpg/250px-Bamako_bridge2.jpg')
      expect(imgs[1].width).toEqual(250)
      expect(imgs[1].height).toEqual(167)
    })

    test('uses max width of 320 when src and data-data-file-original-src are both bigger', async () => {
      const test_window = domino.createWindow(
        `
        <span
          class="mw-file-element gallery-img pcs-widen-image-override pcs-lazy-load-placeholder pcs-lazy-load-placeholder-pending"
          style="width: 1500px"
          data-class="mw-file-element gallery-img pcs-widen-image-override"
          data-src="//upload.wikimedia.org/wikipedia/commons/thumb/4/44/BMW.svg/1500px-BMW.svg.png"
          data-width="1500"
          data-height="1500"
          data-alt="Logo used in vehicles since 1997"
          data-data-file-width="1815"
          data-data-file-height="1815"
          data-data-file-original-src="//upload.wikimedia.org/wikipedia/commons/thumb/4/44/BMW.svg/800px-BMW.svg.png"
          ><span style="padding-top: 100%">
        `,
        'http://en.wikipedia.org/api/rest_v1/page/mobile-html/BMW',
      )
      const mobileRenderer = new WikimediaMobileRenderer()

      const actual = mobileRenderer.INTERNAL.convertLazyLoadToImages(test_window.document)
      const spans = actual.querySelectorAll('.pcs-lazy-load-placeholder')
      const imgs = actual.querySelectorAll('img')

      expect(spans.length).toBe(0)
      expect(imgs.length).toBe(1)
      expect(imgs[0].src).toEqual('https://upload.wikimedia.org/wikipedia/commons/thumb/4/44/BMW.svg/320px-BMW.svg.png')
      expect(imgs[0].width).toEqual(320)
      expect(imgs[0].height).toEqual(320)
    })

    test('uses original src width when it is the smallest', async () => {
      const test_window = domino.createWindow(
        `
        <span
          class="mw-file-element gallery-img pcs-widen-image-override pcs-lazy-load-placeholder pcs-lazy-load-placeholder-pending"
          style="width: 1500px"
          data-class="mw-file-element gallery-img pcs-widen-image-override"
          data-src="//upload.wikimedia.org/wikipedia/commons/thumb/4/44/BMW.svg/150px-BMW.svg.png"
          data-width="150"
          data-height="150"
          data-alt="Logo used in vehicles since 1997"
          data-data-file-width="1815"
          data-data-file-height="1815"
          data-data-file-original-src="//upload.wikimedia.org/wikipedia/commons/thumb/4/44/BMW.svg/800px-BMW.svg.png"
          ><span style="padding-top: 100%">
        `,
        'http://en.wikipedia.org/api/rest_v1/page/mobile-html/BMW',
      )
      const mobileRenderer = new WikimediaMobileRenderer()

      const actual = mobileRenderer.INTERNAL.convertLazyLoadToImages(test_window.document)
      const spans = actual.querySelectorAll('.pcs-lazy-load-placeholder')
      const imgs = actual.querySelectorAll('img')

      expect(spans.length).toBe(0)
      expect(imgs.length).toBe(1)
      expect(imgs[0].src).toEqual('https://upload.wikimedia.org/wikipedia/commons/thumb/4/44/BMW.svg/150px-BMW.svg.png')
      expect(imgs[0].width).toEqual(150)
      expect(imgs[0].height).toEqual(150)
    })
    test('uses prepared src when there is no original src, and no way to URL hack', async () => {
      const test_window = domino.createWindow(
        `
        <span
          class="mw-file-element gallery-img pcs-widen-image-override pcs-lazy-load-placeholder pcs-lazy-load-placeholder-pending"
          style="width: 1500px"
          data-class="mw-file-element gallery-img pcs-widen-image-override"
          data-src="//upload.wikimedia.org/wikipedia/commons/thumb/4/44/BMW.svg/BMW.svg.png"
          data-width="800"
          data-height="800"
          data-alt="Logo used in vehicles since 1997"
          data-data-file-width="1815"
          data-data-file-height="1815"
          ><span style="padding-top: 100%">
        `,
        'http://en.wikipedia.org/api/rest_v1/page/mobile-html/BMW',
      )
      const mobileRenderer = new WikimediaMobileRenderer()

      const actual = mobileRenderer.INTERNAL.convertLazyLoadToImages(test_window.document)
      const spans = actual.querySelectorAll('.pcs-lazy-load-placeholder')
      const imgs = actual.querySelectorAll('img')

      expect(spans.length).toBe(0)
      expect(imgs.length).toBe(1)
      expect(imgs[0].src).toEqual('https://upload.wikimedia.org/wikipedia/commons/thumb/4/44/BMW.svg/BMW.svg.png')
      expect(imgs[0].width).toEqual(800)
      expect(imgs[0].height).toEqual(800)
    })
  })
})
