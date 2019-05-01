/* 
    This file is inserted into generated mobile HTML pages
*/

window.onload = function () {
    $('.mw-ref').on({
        click: function (ev) {
            var targetId = ev.target.hash || ev.target.parentNode.hash;
            var refDetails = $(targetId).closest('details');
            refDetails.attr('open', true);
        }
    });

    if (window.innerWidth > 720) {
        $('details[data-level=2]').attr('open', true);
    }
}
