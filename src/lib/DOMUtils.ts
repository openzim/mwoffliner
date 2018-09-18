const DOMUtils = {
  deleteNode(node) {
    if (node.parentNode) {
      node.parentNode.removeChild(node);
    } else {
      node.outerHTML = '';
    }
    node = undefined;
  },

  appendToAttr(node, attr: string, val: any) {
    const oldVal = node.getAttribute(attr);
    const valToSet = oldVal ? `${oldVal} ${val}` : oldVal;
    node.setAttribute(attr, <any>valToSet);
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
