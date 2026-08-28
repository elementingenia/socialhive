"use client"
import { useState, useRef, useEffect } from "react"
import { clubTextOn } from "@/lib/clubColours"

// ── Hub CSS custom properties → literal hex ──────────────────────────────────
// document.execCommand('foreColor', ...) and the "colour + alpha suffix" string
// trick (e.g. hex + '22') both require a literal colour value — neither
// understands a `var(--x)` reference. Callers pass hub theme colour as
// `var(--teal|--purple|--terracotta)` (see lib/navUtils.js), so resolve it to
// the real hex here, once, for every caller.
const HUB_HEX = {
  '--teal': '#0d9488',
  '--purple': '#7c3aed',
  '--terracotta': '#c2410c',
}

function resolveColour(c) {
  if (!c) return '#0d9488'
  const trimmed = String(c).trim()
  const match = /^var\((--[\w-]+)\)$/.exec(trimmed)
  if (!match) return trimmed // already a literal colour (hex/rgb/named)
  if (HUB_HEX[match[1]]) return HUB_HEX[match[1]]
  if (typeof window !== 'undefined') {
    const resolved = getComputedStyle(document.documentElement).getPropertyValue(match[1]).trim()
    if (resolved) return resolved
  }
  return '#0d9488'
}

// ── BBCode/plain-text → HTML (also handles legacy plain strings already in the DB) ──
export function bbToHtml(text, hubColour) {
  if (!text) return ''
  if (/<[a-z][\s\S]*>/i.test(text)) return text  // already HTML
  const hex = resolveColour(hubColour)
  return text
    .replace(/\[b\]([\s\S]*?)\[\/b\]/g, '<strong>$1</strong>')
    .replace(/\[i\]([\s\S]*?)\[\/i\]/g, '<em>$1</em>')
    .replace(/\[u\]([\s\S]*?)\[\/u\]/g, '<u>$1</u>')
    .replace(/\[c1\]([\s\S]*?)\[\/c1\]/g, `<span style="color:${hex}">$1</span>`)
    .replace(/\[c2\]([\s\S]*?)\[\/c2\]/g, '<span style="color:#888">$1</span>')
    .replace(/\n/g, '<br>')
}

// ── Shared rich text editor (contentEditable) ────────────────────────────────
// Used by Page Texts (admin), Club Landing Page Text, and Event Description /
// Menu / Notes (EventSlideOut, Book Club, Social).
//
// The 3 colour-format buttons (Colour / Black / White) are NOT universally
// safe — which two are legible depends entirely on what the text actually
// renders against once saved, and that differs by caller:
//
//   bg="tile"  — text renders inside a coloured hub/club welcome banner whose
//                background IS `hubColour` (ClubHome's Welcome tile, Movies/
//                Social's WelcomeBanner via admin Page Texts). "Colour" would
//                always be an exact match for that background — 0% contrast,
//                not just "occasionally dumb" — so it's dropped entirely.
//                Offers Black / White only, and the editable box previews the
//                actual tile colour (instead of the hardcoded white editor
//                surface) so White text is visible while typing, not just on
//                the final page.
//   bg="card"  — text renders on a plain/near-white card (Event Description,
//                Notes, Menu text). White is invisible both while editing
//                (the editor surface is always var(--surface) = #fff) and on
//                the final near-white card, so it's dropped. Offers
//                Black / Colour.
//   bg="tint"  — text renders against a SOFT tint + accent-border card, not
//                a solid fill (Happenings Home's Main/Sub Notice, restyled
//                2026-08-28 for readability -- see app/(app)/home/page.js's
//                MainNoticeCard/SubNoticeCard). The editor preview mirrors
//                that exact look (hubColour tint background, hubColour left
//                accent border, var(--text) default text) instead of the old
//                solid-tile preview, which no longer matched what residents
//                actually see once this section stopped using a solid fill.
//                Offers Black / Colour, same as "card" -- White is unreadable
//                against a light tint just like it is against a white card.
//
// Fixed 2026-08-05 after both failure modes were reported live: "Colour" on
// the club Landing Page Text was indistinguishable from the welcome tile
// background (always identical hex), and "White" was unreadable while typing
// in every caller because the editor box was hardcoded white regardless of
// where the text was headed.
export default function RichEditor({
  initialValue, hubColour = '#0d9488', subOnly = false, bg = 'card', onChange,
  minHeight, expandedMinHeight, placeholder,
}) {
  const ref = useRef(null)
  const initDone = useRef(false)
  const [focused, setFocused] = useState(false)
  const hex = resolveColour(hubColour)
  const isTile = bg === 'tile'
  const isTint = bg === 'tint'
  const editorBg = isTile ? hex : (isTint ? hex + '1a' : 'var(--surface)')
  const defaultTextColour = isTile ? clubTextOn(hex) : 'var(--text)'

  const compactHeight = minHeight ?? (subOnly ? 56 : 80)
  const expandedHeight = expandedMinHeight ?? (subOnly ? 140 : 220)

  useEffect(() => {
    if (ref.current && !initDone.current) {
      initDone.current = true
      ref.current.innerHTML = bbToHtml(initialValue, hex)
    }
  }, []) // mount only — do not re-sync; browser owns the content after mount

  function exec(cmd, val) {
    ref.current?.focus()
    document.execCommand(cmd, false, val || null)
    onChange(ref.current?.innerHTML || '')
  }

  // ── Font size control ──────────────────────────────────────────────────────
  // Added 2026-08-28 per Iain's explicit request (Home banner readability
  // feedback -- "Lets have a font size option in the admin screen?" -- rather
  // than a one-off hardcoded size bump). execCommand('fontSize', ...) only
  // understands the legacy 1-7 HTML scale, which can't express a real pixel
  // value and renders inconsistently across browsers -- so we use size="7" as
  // a disposable marker, then immediately replace every resulting <font>
  // element with a <span style="font-size:Npx"> carrying the real size the
  // admin picked. Applied to the current text selection, same interaction
  // pattern as Bold/Italic/Underline/Colour above (select text, tap the size).
  function applyFontSize(px) {
    ref.current?.focus()
    document.execCommand('fontSize', false, '7')
    if (ref.current) {
      const marked = ref.current.querySelectorAll('font[size="7"]')
      marked.forEach(f => {
        const span = document.createElement('span')
        span.style.fontSize = px + 'px'
        while (f.firstChild) span.appendChild(f.firstChild)
        f.parentNode.replaceChild(span, f)
      })
    }
    onChange(ref.current?.innerHTML || '')
  }

  const btnBase = {
    padding: '3px 9px', borderRadius: 6, border: '1px solid var(--border)',
    background: 'var(--surface2)', cursor: 'pointer', fontSize: '0.8rem',
    color: 'var(--text)', fontFamily: 'inherit', lineHeight: 1.4,
  }

  const isEmpty = !initialValue

  return (
    <div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" onMouseDown={e => { e.preventDefault(); exec('bold') }}
          style={{ ...btnBase, fontWeight: 800 }}>B</button>
        <button type="button" onMouseDown={e => { e.preventDefault(); exec('italic') }}
          style={{ ...btnBase, fontStyle: 'italic' }}>I</button>
        <button type="button" onMouseDown={e => { e.preventDefault(); exec('underline') }}
          style={{ ...btnBase, textDecoration: 'underline' }}>U</button>
        {!subOnly && !isTile && (
          <button type="button" onMouseDown={e => { e.preventDefault(); exec('foreColor', hex) }}
            style={{ ...btnBase, background: hex + '22', color: hex, border: '1px solid ' + hex, fontWeight: 700 }}>
            Colour
          </button>
        )}
        {!subOnly && (
          <button type="button" onMouseDown={e => { e.preventDefault(); exec('foreColor', '#000000') }}
            style={{ ...btnBase, color: '#000', fontWeight: 700 }}>Black</button>
        )}
        {!subOnly && isTile && (
          <button type="button" onMouseDown={e => { e.preventDefault(); exec('foreColor', '#ffffff') }}
            style={{ ...btnBase, background: '#444', color: '#fff', fontWeight: 700 }}>White</button>
        )}
        <span style={{ display: 'flex', gap: 2, alignItems: 'center', marginLeft: 4, paddingLeft: 4, borderLeft: '1px solid var(--border)' }}>
          <button type="button" onMouseDown={e => { e.preventDefault(); applyFontSize(15) }}
            title="Normal text size" style={{ ...btnBase, fontSize: '0.7rem', padding: '3px 7px' }}>A</button>
          <button type="button" onMouseDown={e => { e.preventDefault(); applyFontSize(19) }}
            title="Large text" style={{ ...btnBase, fontSize: '0.9rem', padding: '3px 7px' }}>A</button>
          <button type="button" onMouseDown={e => { e.preventDefault(); applyFontSize(24) }}
            title="Extra large text" style={{ ...btnBase, fontSize: '1.05rem', padding: '3px 7px' }}>A</button>
        </span>
        <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginLeft: 4 }}>
          Select text then tap format
        </span>
      </div>
      <div style={{ position: 'relative' }}>
        <div
          ref={ref}
          contentEditable
          suppressContentEditableWarning
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onInput={e => onChange(e.currentTarget.innerHTML)}
          style={{
            minHeight: focused ? expandedHeight : compactHeight,
            transition: 'min-height 0.15s ease',
            border: '1px solid var(--border)', borderRadius: 10,
            borderLeft: isTint ? `4px solid ${hex}` : '1px solid var(--border)',
            padding: '0.75rem 1rem', background: editorBg,
            color: defaultTextColour, fontSize: '0.95rem', lineHeight: 1.55,
            outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
            wordBreak: 'break-word',
          }}
        />
        {isEmpty && !focused && placeholder && (
          <div style={{
            position: 'absolute', top: '0.75rem', left: '1rem', pointerEvents: 'none',
            color: isTile ? defaultTextColour : 'var(--text-dim)', opacity: isTile ? 0.75 : 1,
            fontSize: '0.95rem', fontStyle: 'italic',
          }}>{placeholder}</div>
        )}
      </div>
    </div>
  )
}
