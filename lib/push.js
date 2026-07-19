import { supabaseAdmin } from "@/lib/supabaseAdmin"
import webpush from "web-push"
let configured = false
function ensureConfigured() {
  if (configured) return true
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  if (!pub || !priv) return false
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:iainpallot@gmail.com",
    pub,
    priv
  )
  configured = true
  return true
}

// Sends a Web Push notification to every subscription a member has (phone,
// tablet, whatever they've opted in from). Best-effort: a failure to push
// never blocks or throws for the caller -- the in-app notifications table
// row is the source of truth, push is a nice-to-have on top of it.
//
// A 404/410 response means the browser/OS has invalidated that subscription
// (uninstalled, permission revoked at the OS level, etc.) -- we delete it so
// it stops being tried forever.
export async function sendPushToMember(member_id, { title, body, url }) {
  if (!ensureConfigured()) return // VAPID env vars not set yet -- no-op, not an error

  const { data: subs } = await supabaseAdmin
    .from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("member_id", member_id)
  if (!subs?.length) return

  const payload = JSON.stringify({ title: title || "The Social Hive", body, url: url || "/home" })

  await Promise.all(subs.map(async (sub) => {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload
      )
    } catch (err) {
      if (err?.statusCode === 404 || err?.statusCode === 410) {
        await supabaseAdmin.from("push_subscriptions").delete().eq("id", sub.id)
      }
      // Any other error (network blip, provider outage) -- leave the
      // subscription in place and just skip this one send.
    }
  }))
}
