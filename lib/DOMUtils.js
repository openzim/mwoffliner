"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var DOMUtils = {
    deleteNode: function (node) {
        if (node.parentNode) {
            node.parentNode.removeChild(node);
        }
        else {
            node.outerHTML = '';
        }
        node = undefined;
    },
    appendToAttr: function (node, attr, val) {
        var oldVal = node.getAttribute(attr);
        var valToSet = oldVal ? oldVal + " " + val : oldVal;
        node.setAttribute(attr, valToSet);
    },
    nextElementSibling: function (node) {
        var sibling = node.nextSibling;
        while (sibling && sibling.nodeType !== 1 /* ELEMENT_NODE */) {
            sibling = sibling.nextSibling;
        }
        return sibling;
    },
};
exports.default = DOMUtils;
