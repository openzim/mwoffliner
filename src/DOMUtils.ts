const DOMUtils = {
  deleteNode(node: DominoElement) {
    if (node.parentNode) {
      node.parentNode.removeChild(node)
    } else {
      node.outerHTML = ''
    }
    node = undefined
  },

  appendToAttr(node: DominoElement, attr: string, val: any) {
    const oldVal = node.getAttribute(attr)
    const valToSet = oldVal ? `${oldVal} ${val}` : val
    node.setAttribute(attr, valToSet as any)
  },

  nextElementSibling(node: DominoElement) {
    let sibling = node.nextSibling
    while (sibling && sibling.nodeType !== 1 /* ELEMENT_NODE */) {
      sibling = sibling.nextSibling
    }
    return sibling
  },
}

export default DOMUtils
