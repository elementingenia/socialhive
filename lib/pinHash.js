// PIN hashing (Iain, 2026-10-09). members.pin used to hold every PIN in
// plain text. PINs are now stored only as a salted scrypt hash in
// members.pin_hash; nobody (admins included) can read a PIN back, only
// reset it.
//
// Node's built-in crypto, no extra dependency. Server-side only -- never
// import this from a client component.
//
// Stored format: scrypt$<N>$<r>$<p>$<salt b64>$<hash b64>
import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto"

const N = 16384, R = 8, P = 1, KEYLEN = 32

export function hashPin(pin) {
  const salt = randomBytes(16)
  const hash = scryptSync(String(pin), salt, KEYLEN, { N, r: R, p: P })
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${hash.toString("base64")}`
}

export function verifyPin(pin, stored) {
  if (pin == null || !stored || typeof stored !== "string") return false
  const parts = stored.split("$")
  if (parts.length !== 6 || parts[0] !== "scrypt") return false
  const [, n, r, p, saltB64, hashB64] = parts
  const expected = Buffer.from(hashB64, "base64")
  let actual
  try {
    actual = scryptSync(String(pin), Buffer.from(saltB64, "base64"), expected.length,
      { N: Number(n), r: Number(r), p: Number(p) })
  } catch { return false }
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}
