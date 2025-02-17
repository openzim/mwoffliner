import { LIB_VERSION } from './version.js'

const config = {
  userAgent: `MWOffliner/${LIB_VERSION}`,

  defaults: {
    publisher: 'openZIM',
    redisPath: 'redis://127.0.0.1:6379',
    requestTimeout: 120 * 1000,
  },

  filters: {
    /* All DOM nodes with one of these styles will be removed */
    /* On Wikivoyage 'noprint' remove also top banners like on 'South America'. */
    cssClassBlackList: [
      'noprint',
      'metadata',
      'ambox',
      'stub',
      'topicon',
      'magnify',
      'navbar',
      'mw-kartographer-container',
      'mw-dismissable-notice',
      'navigation-only',
      'listing-sister-icons',
      'owid-frame',
    ],

    /* Additional black list if only intro is dumped */
    nodetCssClassBlackList: ['mw-ref'],

    /* All DOM node with these styles will be deleted
     * if no <a> tag is included in the sub-tree */
    cssClassBlackListIfNoLink: ['mainarticle', 'seealso', 'dablink', 'rellink', 'hatnote'],

    /* All DOM nodes which we should for to display */
    cssClassDisplayList: ['thumb'],

    /* Lead section to display */
    leadSectonId: '0',

    /* List of style to be removed. 'onlyoffline' is a *hack* to
    /* display WPEN medical articles, see for example
    /* [[Carcinoid_syndrome]] */
    cssClassCallsBlackList: ['plainlinks', 'onlyoffline'],

    /* All nodes with one of these ids will be removed */
    idBlackList: ['purgelink'],

    /* This module has no CSS, blacklisting it avoids creating
     * an empty file that generate an error in firefox
     * error is "style sheet could not be loaded"
     */
    blackListCssModules: ['mediawiki.page.gallery'],
  },

  output: {
    // CSS and JS resources added by Kiwix
    cssResourcesCommon: ['style', 'mobile_main_page'],
    jsResourcesCommon: ['script', 'masonry.min', 'article_list_home', 'images_loaded.min'],

    cssResources: ['content.parsoid', 'inserted_style'],
    jsResources: ['../node_modules/details-element-polyfill/dist/details-element-polyfill'],

    wikimediaMobileCssResources: ['wm_mobile_override_style'],
    wikimediaMobileJsResources: ['wm_mobile_override_script'],

    // JS/CSS resources to be imported from MediaWiki
    mw: {
      css: [
        [
          'skins.minerva.base.reset',
          'skins.minerva.content.styles',
          'ext.cite.style',
          'site.styles',
          'mobile.app.pagestyles.android',
          'mediawiki.page.gallery.styles',
          'mediawiki.skinning.content.parsoid',
        ].join('|'),
      ],
      js: [
        'startup',
        'jquery,mediawiki',
        'mediawiki.base',
        'mediawiki.util',
        'site',
        'mediawiki.page.ready',

        // Gadget resources are not shared by Parsoid API https://phabricator.wikimedia.org/T161278
        'jquery.cookie',
        'mediawiki.cookie',
        'mediawiki.storage',
        'ext.gadget.VisibilityToggles',
        'ext.gadget.defaultVisibilityToggles',
      ],
    },

    // Output directories for storing mw related js and css resources
    dirs: {
      mediawiki: 'mw',
    },

    // Output templates (TODO: Needs more docs)
    templates: {
      /* In these files, the following replacements will occur:
       * __ARTICLE_JS_LIST__  ==> list of script tags linking to all the js modules dependencies
       * __ARTICLE_CSS_LIST__ ==> list of link tags linking to all the css modules dependencies
       * __CSS_LINKS__        ==> list of link tags for config.output.cssResources
       */
      pageWikimediaDesktop: './templates/pageWikimediaDesktop.html',
      pageWikimediaMobile: './templates/pageWikimediaMobile.html',

      categories: './templates/categories.html',

      subCategories: './templates/subcategories.html',

      subPages: './templates/subpages.html',

      articleListHomeTemplate: './templates/article_list_home.html',

      /* License footer template code */
      footer: './templates/footer.html',

      /* Template for wrapping lead section content */
      lead_section_wrapper: './templates/lead_section_wrapper.html',

      /* Template for wrapping all other toplevel sections */
      section_wrapper: './templates/section_wrapper.html',

      /* Template for wrapping subsections */
      subsection_wrapper: './templates/subsection_wrapper.html',
    },
  },
}

type Config = typeof config

export { config, Config }
