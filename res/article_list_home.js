var msnry;
(function () {

    document.addEventListener("DOMContentLoaded", function (event) {
        // JS enabled, switch CSS
        var list = document.getElementsByClassName("events");
        for (var i = 0; i < list.length; i++) {
            list[i].remove();
        }
        var withJSCss = document.createElement('link');
        withJSCss.rel = 'stylesheet';
        withJSCss.href = 's/css_modules/mobile_main_page.css';
        document.head.appendChild(
            withJSCss
        );

        var grid = document.getElementById('content');
        imagesLoaded(grid, function () {
            msnry = new Masonry(grid, {
                itemSelector: '.item'
            });
        });
    });
})();