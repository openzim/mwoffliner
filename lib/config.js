"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = {
    userAgent: 'MWOffliner/HEAD',
    defaults: {
        publisher: 'Kiwix',
        redisConfig: '/dev/shm/redis.sock',
        requestTimeout: 60,
    },
    filters: {
        /* All DOM nodes with one of these styles will be removed */
        /* On Wikivoyage 'noprint' remove also top banners like on 'South America'. */
        cssClassBlackList: [
            'noprint', 'metadata', 'ambox', 'stub',
            'topicon', 'magnify', 'navbar',
            'mwe-math-mathml-inline', 'mw-kartographer-container',
            'mw-dismissable-notice', 'navigation-only',
        ],
        /* Additional black list if only intro is dumped */
        nodetCssClassBlackList: ['mw-ref'],
        /* All DOM node with these styles will be deleted
         * if no <a> tag is included in the sub-tree */
        cssClassBlackListIfNoLink: [
            'mainarticle', 'seealso', 'dablink', 'rellink', 'hatnote',
        ],
        /* All DOM nodes which we should for to display */
        cssClassDisplayList: ['thumb'],
        /* List of style to be removed */
        cssClassCallsBlackList: ['plainlinks'],
        /* All nodes with one of these ids will be removed */
        idBlackList: ['purgelink'],
        /* This module has no CSS, blacklisting it avoids creating
         * an empty file that generate an error in firefox
         * error is "style sheet could not be loaded"
         */
        blackListCssModules: ['mediawiki.page.gallery'],
    },
    output: {
        // CSS resources added by Kiwix
        cssResources: ['style', 'content.parsoid', 'inserted_style'],
        mainPageCssResources: ['mobile_main_page'],
        jsResources: ['script', 'masonry.min', 'article_list_home', 'images_loaded.min'],
        // JS/CSS resources to be imported from MediaWiki
        mw: {
            css: [
                ['skins.minerva.base.reset', 'skins.minerva.content.styles',
                    'ext.cite.style', 'mobile.app.pagestyles.android',
                    'mediawiki.page.gallery.styles',
                    'mediawiki.skinning.content.parsoid'].join('|'),
            ],
            js: ['startup', 'jquery', 'mediawiki', 'site'],
        },
        // Output directories for storing js and css resources
        dirs: {
            style: 's',
            media: 'm',
            javascript: 'j',
            styleModules: 'css_modules',
            jsModules: 'js_modules',
        },
        // Output templates (TODO: Needs more docs)
        templates: {
            /* Template code for any redirect to be written on the FS */
            redirects: './templates/redirects.html',
            /* In these files, the following replacements will occur:
             * __ARTICLE_JS_LIST__  ==> list of script tags linking to all the js modules dependencies
             * __ARTICLE_CSS_LIST__ ==> list of link tags linking to all the css modules dependencies
             * __CSS_LINKS__        ==> list of link tags for config.output.cssResources
             */
            page: './templates/page.html',
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
};
