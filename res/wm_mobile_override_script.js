function importScript() { return 1 } // this is to avoid the error from site.js

window.onload = function () {
  // Check if there is a Wikimedia mobile output page
  if (document.querySelector('#pcs')) {
      const supElements = document.querySelectorAll('sup');
      const linkElements = document.querySelectorAll('a');
      const disabledElems = Array.from(supElements).concat(Array.from(linkElements))
      disabledElems.forEach((elem) => {
        elem.addEventListener('click', (event) => {
          event.stopPropagation();
        }, true);
      });
  }
}
