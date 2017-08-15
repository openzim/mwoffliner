"use strict";

var config = {
    userAgent: 'MWOffliner/HEAD',

    defaults: {
        publisher: 'Kiwix',
        redisConfig: '/dev/shm/redis.sock',
        requestTimeout: 60,
    },

    filters: {
        /* All DOM nodes with on of these styles will be removed */
        /* On Wikivoyage 'noprint' remove also top banners like on 'South America'. */
        cssClassBlackList: [
            'noprint', 'metadata', 'ambox', 'stub',
            'topicon', 'magnify', 'navbar',
            'mwe-math-mathml-inline', 'mw-kartographer-container'
        ],

        /* Additional black list if only intro is dumped */
        nodetCssClassBlackList: [ 'mw-ref' ],

        /* All DOM node with these styles will be deleted
         * if no <a> tag is included in the sub-tree */
        cssClassBlackListIfNoLink: [
            'mainarticle', 'seealso', 'dablink', 'rellink', 'hatnote'
        ],

        /* All DOM nodes which we should for to display */
        cssClassDisplayList: ['thumb'],

        /* List of style to be removed */
        cssClassCallsBlackList: ['plainlinks'],

        /* All nodes with one of these ids will be removed */
        idBlackList: ['purgelink'],
    },

    output: {
        cssResources: [ 'mobile.css', 'content.parsoid.css', 'inserted_style_mobile.css' ],

        dirs : {
            style: 's',
            media: 'm',
            javascript: 'j',
            styleModules: 'css_modules',
            jsModules: 'js_modules',
        }

        templates: {
            /* Template code for any redirect to be written on the FS */
            redirects : [
                '<html>', '<head>',
                '<meta charset="UTF-8" />',
                '<title>{{ title }}</title>',
                '<meta http-equiv="refresh" content="0; URL={{ target }}">'
                '</head>', '<body></body>', '</html>'
            ].join(''),
        },
    },
};

module.exports = {
    config: config
};
