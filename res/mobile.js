/* 
    This file is inserted into generated mobile HTML pages
*/


// this function is to be able to open/close section in mobile version since the code from wiki meant to do that doesn't work
function toggleOpenSection(id) {
    if (id === 0) return // do not allow to hide the main section
    $('#mf-section-' + id).toggleClass('open-block').prev().toggleClass('open-block')
}

window.onload = function () {
    $('.mw-ref').on({
        click: function () {
            var ref = $('#References').closest('h2');
            ref.addClass('open-block');
            ref.next().addClass('open-block');
        }
    });

    $('.collapsible-heading').on({
        click: function () {
            var id = this.dataset.sectionId;
            toggleOpenSection(id);
        }
    });
}
