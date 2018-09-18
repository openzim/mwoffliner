const DOMUtils = {
  deleteNode(node) {
    if (node.parentNode) {
      node.parentNode.removeChild(node);
    } else {
      node.outerHTML = '';
    }
    node = undefined;
  },

  appendToAttr(node, attr, val) {
    const oldVal = node.getAttribute(attr);
    node.setAttribute(attr, oldVal ? `${oldVal} ${val}` : oldVal);
  },

  nextElementSibling(node) {
    let sibling = node.nextSibling;
    while (sibling && sibling.nodeType !== 1 /* ELEMENT_NODE */) {
      sibling = sibling.nextSibling;
    }
    return sibling;
  },
};

export default DOMUtils;
