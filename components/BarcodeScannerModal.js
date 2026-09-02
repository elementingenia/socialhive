'use client'
import { useEffect, useRef, useState } from 'react'

// Camera barcode scanner, added 2026-09-02 per Iain's request ("possibilities
// of having a bar code scanner in the add/edit book ISBN rather than only
// manual entry?" -> "yes" build it). Both existing ISBN entry points
// (AddBookSheet's Barcode/ISBN mode, BookDetailSheet's inline Edit/Add ISBN)
// were manual-text-entry-only by deliberate choice at the time
// ("2026-08-13: barcode is manual entry, no camera scan for now") -- this
// adds camera scanning as an ADDITIVE option next to the existing manual
// field in both places, not a replacement, so a scan failure or unsupported
// device never blocks adding/editing an ISBN.
//
// Uses @zxing/browser (MIT licensed, fully client-side -- no cost, no
// external API calls, no image ever leaves the device). Book ISBNs are
// printed as EAN-13 barcodes; UPC_A is included too since some older/US
// editions carry one. Deliberately NOT scanning EAN-8/UPC-E/Code128/QR --
// narrowing the format list to what an ISBN actually is avoids the modal
// firing on the smaller price add-on barcode some books print next to the
// real one.
//
// onDetected(code) is called once with the raw decoded digit string the
// moment a match is found -- the caller is responsible for validating it
// (the existing /api/books/search?isbn= endpoint already does full
// 10/13-digit ISBN validation, so this doesn't duplicate that) and for
// closing the modal. Camera + reader are always torn down on unmount so a
// left-open permission/stream is never leaked.
export default function BarcodeScannerModal({ onDetected, onClose }) {
  const videoRef = useRef(null)
  const readerRef = useRef(null)
  const stoppedRef = useRef(false)
  const [status, setStatus] = useState('starting') // 'starting' | 'scanning' | 'error'
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    stoppedRef.current = false
    let cancelled = false

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus('error')
        setErrorMsg("This device or browser doesn't support camera scanning — enter the number manually instead.")
        return
      }
      try {
        const { BrowserMultiFormatReader } = await import('@zxing/browser')
        const { BarcodeFormat, DecodeHintType } = await import('@zxing/library')
        const hints = new Map()
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.UPC_A])
        const reader = new BrowserMultiFormatReader(hints)
        readerRef.current = reader
        if (cancelled) return
        setStatus('scanning')
        await reader.decodeFromConstraints(
          { video: { facingMode: 'environment' } },
          videoRef.current,
          (result, err) => {
            if (result && !stoppedRef.current) {
              stoppedRef.current = true
              onDetected(result.getText())
            }
            // NotFoundException fires continuously between frames while
            // nothing is decoded yet -- expected, not an error, ignored.
          }
        )
      } catch (e) {
        if (cancelled) return
        setStatus('error')
        setErrorMsg(
          e?.name === 'NotAllowedError'
            ? 'Camera access was denied — allow camera access in your browser settings, or enter the number manually.'
            : e?.name === 'NotFoundError'
            ? 'No camera was found on this device — enter the number manually instead.'
            : 'Could not start the camera — enter the number manually instead.'
        )
      }
    }
    start()

    return () => {
      cancelled = true
      stoppedRef.current = true
      readerRef.current?.reset?.()
    }
  }, [onDetected])

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 420, margin: '0 1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <div style={{ color: '#fff', fontWeight: 700, fontSize: '0.95rem' }}>📷 Scan barcode</div>
          <button onClick={onClose}
            style={{ width: 34, height: 34, borderRadius: '50%', background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', fontSize: '1rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
        </div>

        <div style={{ position: 'relative', width: '100%', aspectRatio: '4 / 3', background: '#000', borderRadius: 16, overflow: 'hidden' }}>
          <video ref={videoRef} muted playsInline
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: status === 'scanning' ? 'block' : 'none' }} />
          {status === 'scanning' && (
            <div style={{ position: 'absolute', inset: '18% 10%', border: '3px solid var(--purple)', borderRadius: 12, boxShadow: '0 0 0 2000px rgba(0,0,0,0.35)' }} />
          )}
          {status === 'starting' && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.7)', fontSize: '0.85rem' }}>
              Starting camera…
            </div>
          )}
          {status === 'error' && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', textAlign: 'center', color: '#fff', fontSize: '0.85rem', lineHeight: 1.5 }}>
              {errorMsg}
            </div>
          )}
        </div>

        {status === 'scanning' && (
          <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.8rem', textAlign: 'center', marginTop: '0.75rem' }}>
            Hold the barcode steady inside the frame
          </div>
        )}

        <button onClick={onClose}
          style={{ width: '100%', marginTop: '1rem', padding: '0.7rem', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.25)', borderRadius: 12, color: '#fff', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
          {status === 'error' ? 'Close' : 'Cancel — enter manually instead'}
        </button>
      </div>
    </div>
  )
}
