function importScript() { return 1 } // this is to avoid the error from site.js

window.onload = function () {

    /* Collapsing of the sections */
    $('.mw-ref').on({
        click: function (ev) {
            var targetId = ev.target.hash || ev.target.parentNode.hash;
            var targetEl = document.getElementById(targetId.slice(1));
            var refDetails = $(targetEl).closest('details');
            refDetails.attr('open', true);
        }
    });

    /* If small screen size and contains section(s) */
    if (window.innerWidth < 720 && $('details')) {

        /* Find the highest level section in window */
        const sectionTopLevel = Math.min(...$('details').
            map( function() { return $(this).attr('data-level'); }).get());

        /* Collapse all highest level section if more than one */
        if ($(`details[data-level=${sectionTopLevel}]`).length !== 1) {
            $(`details[data-level=${sectionTopLevel}]`).attr('open', false);
        }
    }

    /* Add the user-agent to allow dedicated CSS rules (like for KaiOS) */
    document.querySelector('body').setAttribute('data-useragent',  navigator.userAgent);
}

/* WebP Polyfill */
var webpScripts = ['../-/webpHeroPolyfill.js',
                   '../-/webpHeroBundle.js',
                   '../-/webpHandler.js'];
webpScripts = webpScripts.map(function(scriptUrl) {
    const articleId = document.getElementById('script-js').dataset.articleId;

    return (typeof(articleId)) ? '../'.repeat(articleId.split('/').length - 1) + scriptUrl : scriptUrl;
});
var script = document.createElement('script');
script.type = 'text/javascript';
script.src = webpScripts.pop();;
script.onload = function () {
    new WebPHandler({
        scripts_urls: webpScripts,
        on_ready: function (handler) { handler.polyfillDocument(); },
    });
}
document.getElementsByTagName('head')[0].appendChild(script);
