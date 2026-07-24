// Unit tests for lib/clubWatermark.js's computeWatermarkTransform -- the pure
// geometry behind the club watermark pan/zoom editor (Club visual identity,
// Initiative 1, branch spike 2026-07-24). This is the part most likely to
// hide an off-by-something bug (as recurrence's date maths was flagged as
// the highest-risk part of that feature), so it's worth testing directly
// rather than only eyeballing it in the browser.
import { computeWatermarkTransform } from '../../lib/clubWatermark.js'

let pass = 0, fail = 0
const ok = (c, m) => { c ? pass++ : (fail++, console.log('  ✗', m)) }
const approx = (a, b, tol = 0.01) => Math.abs(a - b) <= tol

// Wide banner container, matches WATERMARK_ASPECT "3 / 1"
const container = { containerW: 900, containerH: 300 }

// ── Portrait photo in a wide banner -- width is the constraining axis, so
//    there's plenty of vertical slack to pan through, no zoom needed. ──────
{
  const natural = { naturalW: 1000, naturalH: 1500 }
  const centred = computeWatermarkTransform({ ...container, ...natural, zoom: 1, posX: 50, posY: 50 })
  ok(approx(centred.width, 900), 'portrait: width-constrained axis fills container exactly')
  ok(centred.height > container.containerH, 'portrait: scaled height overflows the container (that is the crop)')
  ok(approx(centred.left, 0), 'portrait centred: no horizontal crop needed, image starts at 0')
  ok(approx(centred.top + centred.height / 2, container.containerH / 2), 'portrait centred: vertically centred on the container')

  const top = computeWatermarkTransform({ ...container, ...natural, zoom: 1, posX: 50, posY: 0 })
  ok(approx(top.top, 0), 'posY=0 shows the very top of the image (image top aligns with container top)')

  const bottom = computeWatermarkTransform({ ...container, ...natural, zoom: 1, posX: 50, posY: 100 })
  ok(approx(bottom.top + bottom.height, container.containerH), 'posY=100 shows the very bottom of the image (image bottom aligns with container bottom)')
}

// ── Landscape photo close to the container's own aspect ratio -- minimal
//    slack, both axes nearly fill exactly. ──────────────────────────────────
{
  const natural = { naturalW: 1800, naturalH: 600 } // exactly 3:1, same as container
  const t = computeWatermarkTransform({ ...container, ...natural, zoom: 1, posX: 50, posY: 50 })
  ok(approx(t.width, 900) && approx(t.height, 300), 'exact-aspect-match landscape: fills container exactly at zoom 1, no crop either axis')
  ok(approx(t.maxOffX, 0) && approx(t.maxOffY, 0), 'exact-aspect-match landscape: no pan room at zoom 1')
}

// ── Zoom always covers -- the image must never leave a gap regardless of
//    zoom level or pan position (the "as long as it covers the page space
//    available" requirement). ───────────────────────────────────────────────
{
  const natural = { naturalW: 1800, naturalH: 600 }
  for (const zoom of [1, 1.5, 2, 3]) {
    for (const [posX, posY] of [[0, 0], [100, 100], [50, 50], [0, 100], [100, 0]]) {
      const t = computeWatermarkTransform({ ...container, ...natural, zoom, posX, posY })
      ok(t.left <= 0.01, `zoom ${zoom} pos ${posX}/${posY}: left edge never shows a gap (left <= 0)`)
      ok(t.top <= 0.01, `zoom ${zoom} pos ${posX}/${posY}: top edge never shows a gap (top <= 0)`)
      ok(t.left + t.width >= container.containerW - 0.01, `zoom ${zoom} pos ${posX}/${posY}: right edge always covers the container`)
      ok(t.top + t.height >= container.containerH - 0.01, `zoom ${zoom} pos ${posX}/${posY}: bottom edge always covers the container`)
    }
  }
}

// ── Zoom increases the rendered size monotonically. ─────────────────────────
{
  const natural = { naturalW: 1200, naturalH: 800 }
  const z1 = computeWatermarkTransform({ ...container, ...natural, zoom: 1, posX: 50, posY: 50 })
  const z2 = computeWatermarkTransform({ ...container, ...natural, zoom: 2, posX: 50, posY: 50 })
  ok(z2.width > z1.width && z2.height > z1.height, 'higher zoom always renders the image larger')
  ok(z2.maxOffX >= z1.maxOffX && z2.maxOffY >= z1.maxOffY, 'higher zoom never reduces available pan room')
}

// ── Degenerate inputs (image not loaded yet / no container measured) return
//    null rather than NaN geometry -- the calling components render the img
//    hidden (opacity 0) until this resolves, so a null here must not throw. ──
{
  ok(computeWatermarkTransform({ containerW: 0, containerH: 0, naturalW: 100, naturalH: 100, zoom: 1, posX: 50, posY: 50 }) === null, 'zero container size => null, not NaN')
  ok(computeWatermarkTransform({ containerW: 900, containerH: 300, naturalW: null, naturalH: null, zoom: 1, posX: 50, posY: 50 }) === null, 'no natural size yet (image still loading) => null')
}

console.log(`\nlib/clubWatermark.js: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
