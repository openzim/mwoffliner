/*
 * Welcome page: balanced justified rows of thumbnails.
 *
 * Without JS, mobile_main_page.css lays the tiles out as flex rows: every row is full
 * width except the last one. This script only sets a whole-pixel width and image height on
 * each tile, so that every row, the last one included, is exactly full width.
 *
 * Each tile carries its aspect ratio r = width / height in --r (clamped at build time). For a
 * container width W and a target row height H:
 *   1. rows k = round(sum(r) * H / W)
 *   2. split the tiles, in order, into k rows whose sums of r are as equal as possible
 *      (linear partition, a small dynamic program, instant for 100 tiles)
 *   3. a row with ratio sum S is W / S tall, so its tiles fill the width exactly
 * Image loading plays no part, so nothing reflows when images arrive.
 */
;(function () {
  // Splits ratios, in order, into k groups minimising the sum of squared distances to the
  // mean group sum. Returns the number of tiles in each group.
  function partition(ratios, k) {
    var n = ratios.length
    var prefix = [0]
    for (var i = 0; i < n; i++) prefix.push(prefix[i] + ratios[i])
    var mean = prefix[n] / k
    // cost[j][m]: best cost of the first m tiles in j rows; from[j][m]: start of the last row
    var cost = [[0]]
    var from = [[0]]
    for (var m = 1; m <= n; m++) cost[0][m] = Infinity
    for (var j = 1; j <= k; j++) {
      cost[j] = []
      from[j] = []
      for (m = 0; m <= n; m++) {
        cost[j][m] = Infinity
        for (var s = j - 1; s < m; s++) {
          var d = prefix[m] - prefix[s] - mean
          var c = cost[j - 1][s] + d * d
          if (c < cost[j][m]) {
            cost[j][m] = c
            from[j][m] = s
          }
        }
      }
    }
    var sizes = []
    for (j = k, m = n; j > 0; j--) {
      sizes.unshift(m - from[j][m])
      m = from[j][m]
    }
    return sizes
  }

  // Returns one { w, h } box per tile in whole pixels. Widths round cumulatively so that
  // each row adds up to the width exactly, with no overlap and no hairline gap.
  function justify(ratios, width, rowHeight) {
    var total = 0
    for (var i = 0; i < ratios.length; i++) total += ratios[i]
    var k = Math.max(1, Math.min(ratios.length, Math.round((total * rowHeight) / width)))
    var sizes = partition(ratios, k)
    var boxes = []
    var start = 0
    for (var row = 0; row < sizes.length; row++) {
      var sum = 0
      for (i = start; i < start + sizes[row]; i++) sum += ratios[i]
      var h = Math.round(width / sum)
      var x = 0
      for (i = start; i < start + sizes[row]; i++) {
        var left = Math.round(x)
        x += (ratios[i] * width) / sum
        var right = i === start + sizes[row] - 1 ? width : Math.round(x)
        boxes.push({ w: right - left, h: h })
      }
      start += sizes[row]
    }
    return boxes
  }

  function layout(container) {
    var items = container.querySelectorAll('.item')
    var width = Math.floor(container.getBoundingClientRect().width)
    // Same target row height as the CSS flex rows: three quarters of a column width
    var cols = parseFloat(getComputedStyle(container).getPropertyValue('--cols')) || 4
    if (!items.length || !width) return
    var ratios = []
    for (var i = 0; i < items.length; i++) ratios.push(parseFloat(items[i].style.getPropertyValue('--r')) || 4 / 3)
    var boxes = justify(ratios, width, (0.75 * width) / cols)
    for (i = 0; i < items.length; i++) {
      items[i].style.setProperty('--w', boxes[i].w + 'px')
      items[i].style.setProperty('--h', boxes[i].h + 'px')
    }
    container.classList.add('is-justified')
  }

  window.pageListHome = { partition: partition, justify: justify }

  document.addEventListener('DOMContentLoaded', function () {
    var content = document.getElementById('content')
    // Engines without CSS variables keep the CSS fallback layout
    if (!document.body.classList.contains('page-list-home') || !content || !(window.CSS && CSS.supports && CSS.supports('--r', '0'))) return
    layout(content)
    // Relayout when the width changes, including when a scrollbar comes or goes
    var timer
    var width = content.getBoundingClientRect().width
    var relayout = function () {
      clearTimeout(timer)
      timer = setTimeout(function () {
        if (content.getBoundingClientRect().width === width) return
        width = content.getBoundingClientRect().width
        layout(content)
      }, 100)
    }
    if (window.ResizeObserver) new ResizeObserver(relayout).observe(content)
    else window.addEventListener('resize', relayout)
  })
})()
