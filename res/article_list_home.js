var msnry;
(function () {

    document.addEventListener("DOMContentLoaded", function (event) {

        // js available, remove nojs styles
        document.getElementsByClassName('mw-body-content')[0].classList.remove('nojs');

        var grid = document.getElementById('content');
        imagesLoaded(grid, function () {
            msnry = new Masonry(grid, {
                itemSelector: '.item'
            });
        });
    });
})();