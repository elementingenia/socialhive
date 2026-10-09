// Login lockout (Iain, 2026-10-09): 5 wrong PINs in a row locks that
// account for 15 minutes. A correct PIN resets the count; an admin PIN
// reset clears the lock. Pure functions -- no DB -- so they unit-test.

export const MAX_PIN_ATTEMPTS = 5
export const PIN_LOCK_MINUTES = 15

/** Minutes left on the lock (rounded up), or 0 if not locked. */
export function lockMinutesLeft(member, now = new Date()) {
  const until = member?.pin_locked_until ? new Date(member.pin_locked_until) : null
  if (!until || until <= now) return 0
  return Math.ceil((until - now) / 60000)
}

/** Columns to write after a wrong PIN. */
export function afterFailedPin(member, now = new Date()) {
  const lockExpired = member?.pin_locked_until && new Date(member.pin_locked_until) <= now
  const prior = lockExpired ? 0 : (member?.failed_pin_attempts || 0)
  const attempts = prior + 1
  if (attempts >= MAX_PIN_ATTEMPTS) {
    return {
      failed_pin_attempts: 0,
      pin_locked_until: new Date(now.getTime() + PIN_LOCK_MINUTES * 60000).toISOString(),
    }
  }
  return { failed_pin_attempts: attempts, pin_locked_until: null }
}

export function lockedMessage(minutes) {
  return `Too many wrong PINs. This account is locked for ${minutes} more minute${minutes === 1 ? "" : "s"}. ` +
    "Try again then, or ask an admin to reset your PIN."
}
