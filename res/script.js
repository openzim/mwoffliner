// Manage the section colapsing
var addSectionCollapsing = function() {
    $('.mw-ref').on({
        click: function (ev) {
            var targetId = ev.target.hash || ev.target.parentNode.hash;
            var targetEl = document.getElementById(targetId.slice(1));
            var refDetails = $(targetEl).closest('details');
            refDetails.attr('open', true);
        }
    });

    if (window.innerWidth < 720) {
        $('details[data-level=2]').attr('open', false);
    }
}

// Add user-agent for CSS hacking
var addUserAgent = function() {
    document.querySelector('body').setAttribute('data-useragent',  navigator.userAgent);
}

// Add WebP polyfill to the DOM (if necessary)
var testWebP = function(callback) {
    var webP = new Image();
    webP.onload = webP.onerror = function () {
        callback(webP.height == 2);
    };
    webP.src = 'data:image/webp;base64,UklGRjoAAABXRUJQVlA4IC4AAACyAgCdASoCAAIALmk0mk0iIiIiIgBoSygABc6WWgAA/veff/0PP8bA//LwYAAA';
};

var startWebpMachine = function() {
    var newScript = document.createElement('script');
    var inlineScript = document.createTextNode('var webpMachine = new webpHero.WebpMachine(); webpMachine.polyfillDocument()');
    newScript.appendChild(inlineScript);
    document.getElementsByTagName('body')[0].appendChild(newScript);
};

var addWebP = function() {
    testWebP(function(support) {
        if (!support) {
            ['../-/j/js_modules/webpHeroPolyfill.js', '../-/j/js_modules/webpHeroBundle.js']
                .forEach(function(scriptUrl) {
                    var script = document.createElement('script');
                    script.type = 'text/javascript';
                    script.src = scriptUrl;
                    if (webHeroScripts[webHeroScripts.length-1] === scriptUrl) {
                        // Start webpMachine if we have loaded the last script
                        script.onload = startWebpMachine;
                    }
                    document.getElementsByTagName('body')[0].appendChild(script);
                });
        }
    });
};

window.onload = function () {
    addUserAgent();
    addSectionCollapsing();
    addWebP();
}
