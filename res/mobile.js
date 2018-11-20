/* 
    This file is inserted into generated mobile HTML pages
*/


// this function is to be able to open/close section in mobile version since the code from wiki meant to do that doesn't work
function toggleOpenSection(id) {
    if (id === '0') return // do not allow to hide the main section
    $('#mf-section-' + id).toggleClass('open-block').prev().toggleClass('open-block')
}

window.onload = function () {
    $('.mw-ref').on({
        click: function (ev) {
            var targetId = ev.target.hash || ev.target.parentNode.hash;
            var refBlock = $(targetId).closest('.collapsible-block');
            var refHeader = refBlock.prev();
            refBlock.addClass('open-block');
            refHeader.addClass('open-block');

            refBlock.find('collapsible-block').addClass('open-block');
        }
    });

    $('.collapsible-heading').on({
        click: function () {
            var id = this.dataset.sectionId;
            toggleOpenSection(id);
        }
    });

    if (window.innerWidth > 720) {
        $('.collapsible-heading').click();
    }
}
