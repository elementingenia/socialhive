// Shrink a picked photo in the browser before upload (2026-10-27). Phone
// photos are often 3-8MB, and Vercel refuses any request body over 4.5MB
// before our route runs (same limit behind BUG-040). Drawing it onto a
// 1024px canvas first keeps the upload to a few hundred KB; the server then
// crops it to the final 320px square. If the browser can't decode the file
// (e.g. HEIC outside Safari) the original is sent and the server decides.
const MAX_SIDE = 1024

export async function shrinkPhotoForUpload(file) {
  try {
    if (typeof createImageBitmap !== "function") return file
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" })
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
    const w = Math.round(bitmap.width * scale)
    const h = Math.round(bitmap.height * scale)
    const canvas = document.createElement("canvas")
    canvas.width = w
    canvas.height = h
    canvas.getContext("2d").drawImage(bitmap, 0, 0, w, h)
    bitmap.close?.()
    const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", 0.85))
    return blob ? new File([blob], "photo.jpg", { type: "image/jpeg" }) : file
  } catch {
    return file
  }
}
