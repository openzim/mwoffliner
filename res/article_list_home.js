
(function () {

    document.addEventListener("DOMContentLoaded", function () {

        var body = document.body;
        if (body.classList.contains('article-list-home')) {
            // 'import' to avoid not defined js error
            var imagesLoaded = window['imagesLoaded'];
            var Masonry = window['Masonry'];
            var grid = document.getElementById('content');

            // js available, remove nojs styles
            document.getElementsByClassName('mw-body-content')[0].classList.remove('nojs');

            imagesLoaded(grid, function () {
                new Masonry(grid, {
                    itemSelector: '.item'
                });
            });
        }

    });
})();