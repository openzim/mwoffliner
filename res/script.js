/*
 * Functions for categories pagination
 */

document.addEventListener('DOMContentLoaded', () => {
  showHideJs()
})

function showHideJs() {
  for (const item of ['mw-subcategories', 'mw-pages', 'mw-category-media']) {
    const section = document.getElementById(item)
    if (!section) {
      continue
    }
    for (const span of section.querySelectorAll('.mwo-no-js')) {
      span.style.display = 'none'
    }
    for (const span of section.querySelectorAll('.mwo-js')) {
      span.style.display = 'block'
    }
  }
}

async function displayCategoryPartial(target, partialPath) {
  const response = await fetch(partialPath)
  const html = await response.text()

  const doc = new DOMParser().parseFromString(html, 'text/html')
  const newContent = doc.getElementById(target)

  if (newContent) {
    document.getElementById(target).replaceWith(newContent)
    showHideJs()
  }
}
