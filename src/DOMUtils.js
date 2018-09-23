'use strict';

var DOMUtils = {
  deleteNode: function(node) {
    if (node.parentNode) {
      node.parentNode.removeChild(node);
    } else {
      node.outerHTML = '';
    }
    node = undefined;
  },

  appendToAttr: function(node, attr, val) {
    var oldVal = node.getAttribute(attr);
    node.setAttribute(attr, oldVal ? oldVal + ' ' + val : oldVal);
  },

  nextElementSibling: function(node) {
    var sibling = node.nextSibling;
    while (sibling && sibling.nodeType != 1 /* ELEMENT_NODE */) {
      sibling = sibling.nextSibling;
    }
    return sibling;
  }
};

module.exports = {
  DOMUtils: DOMUtils
};
