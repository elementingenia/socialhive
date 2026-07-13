"use client"
// lib/pushClient.js — browser-side helpers for the Web Push opt-in toggle
// (components/ProfileSlideOver.js). Handles service worker registration,
// the permission prompt, and posting/deleting the subscription via
// /api/push/subscribe. No server code here — see lib/push.js for sending.

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/")
  const rawData = atob(base64)
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)))
}

// iPadOS 13+ identifies as "MacIntel" in the UA string, so the only
// reliable signal left is that real Macs don't have touch points.
export function isIOS() {
  if (typeof navigator === "undefined") return false
  return /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
}

export function isStandalone() {
  if (typeof window === "undefined") return false
  return window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true
}

// iOS only allows Push/Notification APIs from a web app the resident has
// actually added to their Home Screen (Safari, in a normal tab, always
// returns unsupported) — see WebKit's Badging/Web Push for Home Screen
// Web Apps posts. Every other platform just needs the standard APIs.
export function isPushSupported() {
  if (typeof window === "undefined") return false
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || typeof Notification === "undefined") return false
  if (isIOS() && !isStandalone()) return false
  return true
}

export async function getExistingSubscription() {
  if (!("serviceWorker" in navigator)) return null
  const reg = await navigator.serviceWorker.getRegistration()
  if (!reg) return null
  return reg.pushManager.getSubscription()
}

export async function subscribeToPush(accessToken) {
  const reg = await navigator.serviceWorker.register("/sw.js")
  await navigator.serviceWorker.ready

  const permission = await Notification.requestPermission()
  if (permission !== "granted") throw new Error("Notification permission was not granted")

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  if (!publicKey) throw new Error("Push isn't configured yet")

  let subscription = await reg.pushManager.getSubscription()
  if (!subscription) {
    subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    })
  }

  const res = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ subscription: subscription.toJSON() }),
  })
  if (!res.ok) throw new Error("Failed to save subscription")
  return subscription
}

export async function unsubscribeFromPush(accessToken) {
  const sub = await getExistingSubscription()
  if (!sub) return
  const endpoint = sub.endpoint
  await sub.unsubscribe()
  await fetch("/api/push/subscribe", {
    method: "DELETE",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ endpoint }),
  }).catch(() => {})
}
