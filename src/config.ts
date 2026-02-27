import { LIB_VERSION } from './version.js'

const config = {
  userAgent: `MWOffliner/${LIB_VERSION}`,

  defaults: {
    publisher: 'openZIM',
    redisPath: 'redis://127.0.0.1:6379',
    requestTimeout: 120 * 1000,
    maxlag: '5',
  },

  candidateIndexPath: ['index', 'welcome', 'home', 'Main_Page'],

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
    leadSectionId: '0',

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
    cssResourcesCommon: ['style', 'mobile_main_page', 'footer'],
    jsResourcesCommon: ['script', 'masonry.min', 'article_list_home', 'images_loaded.min'],

    downloadErrorResources: ['article_not_found.svg', 'DMSans-Regular.ttf', 'download_error_placeholder.css'],

    // JS/CSS resources to be imported from MediaWiki
    mw: {
      css: [
        'site.styles', // always needed
        'noscript', // recommended until we solve https://github.com/openzim/mwoffliner/issues/2310
      ],
      js: [
        // base JS scripts always needed / never returned on API calls
        'startup',
      ],
    },

    // Output paths for storing stuff
    dirs: {
      mediawiki: '_mw_', // mw related js and css resources
      webp: '_webp_', // webp polyfills
      assets: '_assets_', // images, videos and other assets
      res: '_res_', // additional resources from mwoffliner
    },

    // Output templates (TODO: Needs more docs)
    templates: {
      /* In these files, the following replacements will occur:
       * __ARTICLE_JS_LIST__  ==> list of script tags linking to all the js modules dependencies
       * __ARTICLE_CSS_LIST__ ==> list of link tags linking to all the css modules dependencies
       * __CSS_LINKS__        ==> list of link tags for config.output.cssResources
       */
      pageVectorLegacy: './templates/pageVectorLegacy.html',
      pageVector2022: './templates/pageVector2022.html',
      pageFallback: './templates/pageFallback.html',

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

      /* Template for article download error */
      downloadErrorPlaceholder: './templates/download_error_placeholder.html',

      /* Template for HTML-based redirects (to section of an article typically) */
      htmlRedirect: './templates/html_redirect.html',
    },
  },
}

type Config = typeof config

export { config, type Config }
