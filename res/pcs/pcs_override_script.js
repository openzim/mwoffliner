function importScript() { return 1 } // this is to avoid the error from site.js

window.onload = function () {
  // Check if there is a PCS output page
  if (document.querySelector('#pcs')) {
      const supElements = document.querySelectorAll('sup');
      const backLinkElements = document.querySelectorAll('a.pcs-ref-back-link');
      const disabledElems = Array.from(supElements).concat(Array.from(backLinkElements))
      disabledElems.forEach((elem) => {
        elem.addEventListener('click', (event) => {
          event.stopPropagation();
        }, true);
      });
  }
}
