// Server-side PIN check shared by every route that accepts a PIN:
// login, forced Change Password, and Profile's Change PIN. Applies the
// lockout and upgrades any not-yet-hashed PIN on the way through.
import { hashPin, verifyPin } from "@/lib/pinHash"
import { lockMinutesLeft, afterFailedPin } from "@/lib/pinLockout"

// Columns the caller must select on the member row for checkMemberPin.
export const PIN_AUTH_COLUMNS = "pin, pin_hash, failed_pin_attempts, pin_locked_until"

/**
 * @returns {Promise<{ok:true} | {ok:false, lockedMinutes:number} | {ok:false, wrong:true}>}
 */
export async function checkMemberPin(supabaseAdmin, member, pin) {
  const now = new Date()
  const locked = lockMinutesLeft(member, now)
  if (locked > 0) return { ok: false, lockedMinutes: locked }

  // Fallback to the legacy plain-text column only while a row has no hash
  // yet (rows untouched since migration 132); it is upgraded right here.
  const good = member.pin_hash
    ? verifyPin(pin, member.pin_hash)
    : (member.pin != null && member.pin === String(pin))

  if (!good) {
    const next = afterFailedPin(member, now)
    await supabaseAdmin.from("members").update(next).eq("id", member.id)
    return next.pin_locked_until
      ? { ok: false, lockedMinutes: lockMinutesLeft(next, now) }
      : { ok: false, wrong: true }
  }

  const patch = {}
  if (member.failed_pin_attempts || member.pin_locked_until) {
    patch.failed_pin_attempts = 0
    patch.pin_locked_until = null
  }
  if (!member.pin_hash) { patch.pin_hash = hashPin(pin); patch.pin = null }
  if (Object.keys(patch).length) await supabaseAdmin.from("members").update(patch).eq("id", member.id)
  return { ok: true }
}

/** Columns to write when setting a new PIN (any route). Never stores plain text. */
export function newPinColumns(pin) {
  return { pin: null, pin_hash: hashPin(pin), failed_pin_attempts: 0, pin_locked_until: null }
}
