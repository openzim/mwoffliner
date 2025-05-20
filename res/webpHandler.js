function extend(obj, src) {
  for (var key in src) {
    if (src.hasOwnProperty(key)) obj[key] = src[key]
  }
  return obj
}

var WebPHandler = (function () {
  var defaults

  WebPHandler.name = 'WebPHandler'

  defaults = {
    // function to attach to img el before replacing src
    on_error: null,
    // whether to use an url: pngData cache of decoded images. disable if you have
    // too many images on page
    use_cache: true,
    // function to call once WebPHandler is ready
    on_ready: null,
    scripts_urls: ['./webp-hero.polyfill.js', './webp-hero.bundle.js'],
  }

  function WebPHandler(options) {
    this.options = extend(defaults, options)

    this.webp_machine = null
    this.supports_webp = true
    var parent = this
    this.testWebP(function (supports) {
      parent.supports_webp = supports
      if (typeof webpHero === 'undefined') {
        console.debug('Loading webpHero scripts')
        parent.options.scripts_urls.forEach(function (scriptUrl) {
          var script = document.createElement('script')
          script.type = 'text/javascript'
          script.src = scriptUrl
          if (parent.options.scripts_urls[parent.options.scripts_urls.length - 1] === scriptUrl) {
            // Start webpMachine if we have loaded the last script
            script.onload = function () {
              parent.start()
            }
          }
          document.querySelector('body').appendChild(script)
        })
      } else {
        console.debug('webpHero already loaded')
        parent.start()
      }
    })
    this.cache = {}
    this.pending = []
    this.running = false
  }

  WebPHandler.prototype.start = function () {
    this.webp_machine = new webpHero.WebpMachine()
    console.debug(WebPHandler.name, 'initialized. Supports WebP:', this.supports_webp)
    if (this.options.on_ready) this.options.on_ready(this)
  }

  WebPHandler.prototype.addToPipe = function (image) {
    this.pending.push(image)
  }

  WebPHandler.prototype.polyfillPipe = async function () {
    if (this.running) return
    this.running = true

    var image = this.pending.shift()
    while (image !== undefined) {
      try {
        if (this.options.on_error) {
          image.onerror = this.options.on_error
        }
        await this.do_polyfillImage(image)
      } catch (e) {
        console.error(e)
        if (e.name == 'WebpMachineBusyError') {
          this.addToPipe(image)
        } else {
          // failed in our code so browser won't trigger the onerror attr
          if (this.options.on_error) {
            this.options.on_error(image)
          }
        }
      }
      image = this.pending.shift()
    }
    this.running = false
  }

  WebPHandler.prototype.do_polyfillImage = async function (image) {
    const { src } = image
    if (this.options.use_cache && this.cache[src]) {
      image.src = this.cache[src]
      return
    }
    try {
      const webpData = await webpHero.loadBinaryData(src)
      const pngData = await this.webp_machine.decode(webpData)
      if (this.options.use_cache) {
        image.src = this.cache[src] = pngData
      } else {
        image.src = pngData
      }
    } catch (error) {
      if (/busy$/i.test(error.message)) {
        error.name = 'WebpMachineBusyError'
      } else {
        error.name = 'WebpMachineError'
        error.message = `failed to polyfill image "${src}": ${error.message}`
      }
      throw error
    }
  }

  WebPHandler.prototype.polyfillImage = async function (image) {
    const { src } = image
    if (this.webp_machine.detectWebpImage(image)) {
      if (this.options.use_cache && this.cache[src]) {
        image.src = this.cache[src]
        return
      }
      this.addToPipe(image)
      this.polyfillPipe()
    }
  }

  /**
   * Polyfill webp format on the entire web page
   */
  WebPHandler.prototype.polyfillDocument = async function (document) {
    if (!document) {
      document = window.document
    }
    if (this.supports_webp) return null
    for (const image of Array.from(document.querySelectorAll('img'))) {
      try {
        await this.polyfillImage(image)
      } catch (error) {
        error.name = 'WebpMachineError'
        error.message = `webp image polyfill failed for url "${image.src}": ${error}`
        throw error
      }
    }
  }

  WebPHandler.prototype.testWebP = function (callback) {
    var webp_image = new Image()
    webp_image.onload = webp_image.onerror = function () {
      callback(webp_image.height === 2)
    }
    webp_image.src = 'data:image/webp;base64,UklGRjoAAABXRUJQVlA4IC4AAACyAgCdASoCAAIALmk0mk0iIiIiIgBoSygABc6WWgAA/veff/0PP8bA//LwYAAA'
  }

  /**
   * Manually wipe the cache to save memory
   */
  WebPHandler.prototype.clearCache = function () {
    this.cache = {}
  }

  return WebPHandler
})()
