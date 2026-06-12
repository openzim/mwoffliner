// Helper function to resize category iframes
function resizeIframeToContent(iframe) {
  iframe.style.height = '0px' // Resize to 0 first to get proper scroll height
  iframe.style.height = iframe.contentWindow.document.documentElement.scrollHeight + 'px'
}

function attachIframe(iframe) {
  const doc = iframe.contentDocument
  const observer = new MutationObserver(() => {
    resizeIframeToContent(iframe)
  })
  observer.observe(doc.body, { childList: true, subtree: true, attributes: true, characterData: true })
  resizeIframeToContent(iframe)
}
