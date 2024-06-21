import * as domino from 'domino'

import { WikimediaMobileRenderer } from '../../../src/renderers/wikimedia-mobile.renderer'

describe('mobile renderer', () => {
  let window

  describe('image converter', () => {
    beforeEach(() => {
      window = domino.createWindow(
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
          <li>Misira</li>
          <li>Medina Kura</li>
          <li>Bankɔni</li>
          <li>Maɲambugu</li>
          <li>Dravela</li>
          <li>Jɛlibugu</li>
          <li>Bolibana</li>
          <li>Wɔlɔfɔbugu</li>
          <li>Bajalan I,II,III</li>
          <li>ɲarela</li>
          <li>Bagadaji</li>
          <li>Bozola</li>
          <li>Falaje</li>
          <li>ɲamakoro</li>
          <li>Sɛbenikɔrɔ</li>
          <li>Quinzanbugu</li>
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
    })

    test('it converts lazy load to images with the proper size', async () => {
      const mobileRenderer = new WikimediaMobileRenderer()

      const actual = mobileRenderer.INTERNAL.convertLazyLoadToImages(window.document)
      const spans = actual.querySelectorAll('.pcs-lazy-load-placeholder')
      const imgs = actual.querySelectorAll('img')

      expect(spans.length).toBe(0)
      expect(imgs.length).toBe(2)
      expect(imgs[0].src).toEqual('https://upload.wikimedia.org/wikipedia/commons/thumb/8/8f/Bamako_et_fleuve_Niger.jpg/250px-Bamako_et_fleuve_Niger.jpg')
      expect(imgs[1].src).toEqual('https://upload.wikimedia.org/wikipedia/commons/thumb/2/20/Bamako_bridge2.jpg/250px-Bamako_bridge2.jpg')
    })
  })
})
