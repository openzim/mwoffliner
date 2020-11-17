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
var webHeroScripts = ['../-/j/js_modules/webpHeroPolyfill.js',
                      '../-/j/js_modules/webpHeroBundle.js'];

var testWebP = function(callback) {
    var webP = new Image();
    webP.onload = webP.onerror = function () {
        callback(webP.height === 2);
    };
    webP.src = 'data:image/webp;base64,UklGRjoAAABXRUJQVlA4IC4AAACyAgCdASoCAAIALmk0mk0iIiIiIgBoSygABc6WWgAA/veff/0PP8bA//LwYAAA';
};

var startWebpMachine = function() {
    var newScript = document.createElement('script');
    var inlineScript = document.createTextNode('var webpMachine = new webpHero.WebpMachine(); webpMachine.polyfillDocument()');
    newScript.appendChild(inlineScript);
    document.getElementsByTagName('body')[0].appendChild(newScript);
};

testWebP(function(support) {
    if (!support) {
        webHeroScripts.forEach(function(scriptUrl) {
            var script = document.createElement('script');
            script.type = 'text/javascript';
            script.src = typeof(articleId) ? '../'.repeat(articleId.split('/').length - 1) + scriptUrl : scriptUrl;
            if (webHeroScripts[webHeroScripts.length-1] === scriptUrl) {
                // Start webpMachine if we have loaded the last script
                script.onload = startWebpMachine;
            }
            document.getElementsByTagName('body')[0].appendChild(script);
        });
    }
});
