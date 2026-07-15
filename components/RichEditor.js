"use client"
import { useState, useRef, useEffect } from "react"

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
// Used by Page Texts (admin) and Event Description / Menu (EventSlideOut).
// Expands while focused so there's room to see/edit longer passages, then
// collapses back to its compact height on blur.
export default function RichEditor({
  initialValue, hubColour = '#0d9488', subOnly = false, onChange,
  minHeight, expandedMinHeight, placeholder,
}) {
  const ref = useRef(null)
  const initDone = useRef(false)
  const [focused, setFocused] = useState(false)
  const hex = resolveColour(hubColour)

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
        {!subOnly && (
          <>
            <button type="button" onMouseDown={e => { e.preventDefault(); exec('foreColor', hex) }}
              style={{ ...btnBase, background: hex + '22', color: hex, border: '1px solid ' + hex, fontWeight: 700 }}>
              Colour
            </button>
            <button type="button" onMouseDown={e => { e.preventDefault(); exec('foreColor', '#000000') }}
              style={{ ...btnBase, color: '#000', fontWeight: 700 }}>Black</button>
            <button type="button" onMouseDown={e => { e.preventDefault(); exec('foreColor', '#ffffff') }}
              style={{ ...btnBase, background: '#444', color: '#fff', fontWeight: 700 }}>White</button>
          </>
        )}
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
            padding: '0.75rem 1rem', background: 'var(--surface)',
            color: 'var(--text)', fontSize: '0.95rem', lineHeight: 1.55,
            outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
            wordBreak: 'break-word',
          }}
        />
        {isEmpty && !focused && placeholder && (
          <div style={{
            position: 'absolute', top: '0.75rem', left: '1rem', pointerEvents: 'none',
            color: 'var(--text-dim)', fontSize: '0.95rem', fontStyle: 'italic',
          }}>{placeholder}</div>
        )}
      </div>
    </div>
  )
}
