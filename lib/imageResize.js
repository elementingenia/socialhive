import sharp from "sharp"

// Resize + re-encode an uploaded image before it hits Supabase Storage.
//
// Why this exists (evidence, 2026-08-23): every upload route that writes
// to Storage -- events/image, locations/image, info/documents -- wrote
// the raw uploaded bytes straight through with no resize/compress step
// at all. Confirmed by grepping the whole repo for an image library
// (none existed) and reading all three routes end to end. A resident
// uploading a full-res phone photo (3-5MB) as an event cover got exactly
// that stored, unmodified -- two real examples already in production at
// 3.4MB and 1.36MB for a card image that renders at a few hundred px.
//
// On the Supabase free tier, storage CAPACITY (1GB) was never actually
// the risk -- total usage across every bucket is ~13MB, 1.3% of the cap.
// The real constraint is the 5GB/month EGRESS cap: Storage's own default
// cache-control is only 1 hour, so every resident re-downloads the full
// image on every visit more than an hour apart. A few oversized images
// viewed repeatedly by a community scaling toward 165 homes compounds
// that fast. This function is the write-side fix (smaller files to begin
// with); MAX_AGE_SECONDS below is the read-side fix (fewer re-downloads).
export async function resizeImage(buffer) {
  const out = await sharp(buffer)
    .rotate() // respect EXIF orientation first -- otherwise a sideways
              // phone photo gets resized sideways and stays sideways.
    .resize({
      width: MAX_DIMENSION,
      height: MAX_DIMENSION,
      fit: "inside",
      withoutEnlargement: true, // never upscale a small/already-tiny image
    })
    .webp({ quality: WEBP_QUALITY })
    .toBuffer()

  return { buffer: out, contentType: "image/webp", ext: "webp" }
}

const MAX_DIMENSION = 1600
const WEBP_QUALITY = 82

// 30 days. Safe to set this long because every caller that uses it
// already cache-busts on change: events/image and locations/image both
// append `?t=<timestamp>` to the stored URL on every re-upload, and
// info/documents writes a fresh random path per upload -- so a long
// cache life can never serve a stale image after a real edit.
export const MAX_AGE_SECONDS = String(60 * 60 * 24 * 30)
