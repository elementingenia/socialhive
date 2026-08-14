diff --git a/components/Header.js b/components/Header.js
index 0908bf7..79e067d 100644
--- a/components/Header.js
+++ b/components/Header.js
@@ -124,14 +124,26 @@ export default function Header() {
     </button>
   )
 
-  const bellBtn = notifCount > 0 ? (
-    <button onClick={openNotif} aria-label="Notifications" style={{ position: "relative", width: 30, height: 30, borderRadius: "50%", border: "1.5px solid #e53e3e", display: "flex", alignItems: "center", justifyContent: "center", color: "#e53e3e", background: "none", cursor: "pointer", flexShrink: 0 }}>
+  // Bell is ALWAYS rendered (fixed 2026-08-14, Iain live-feedback) -- it used
+  // to be `notifCount > 0 ? <button> : null`, which unmounted the bell itself
+  // the moment the count hit zero. Combined with NotificationsDrawer's old
+  // auto-mark-all-read-on-open behaviour, that meant: open the drawer once,
+  // every notification silently becomes read, count drops to 0, bell
+  // vanishes from the header -- with no other entry point to the drawer
+  // anywhere in the app, the panel became permanently unreachable and
+  // whatever alerts had been in it were gone for good. Only the red badge
+  // is now conditional; the bell button itself is permanent chrome, same as
+  // the Questions button beside it.
+  const bellBtn = (
+    <button onClick={openNotif} aria-label="Notifications" style={{ position: "relative", width: 30, height: 30, borderRadius: "50%", border: `1.5px solid ${notifCount > 0 ? "#e53e3e" : "var(--border)"}`, display: "flex", alignItems: "center", justifyContent: "center", color: notifCount > 0 ? "#e53e3e" : "var(--text-dim)", background: "none", cursor: "pointer", flexShrink: 0 }}>
       <BellIcon size={16} />
-      <span style={{ position: "absolute", top: -3, right: -3, minWidth: 16, height: 16, borderRadius: "50%", background: "#e53e3e", color: "#fff", fontSize: "0.6rem", fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px", lineHeight: 1 }}>
-        {notifCount > 9 ? "9+" : notifCount}
-      </span>
+      {notifCount > 0 && (
+        <span style={{ position: "absolute", top: -3, right: -3, minWidth: 16, height: 16, borderRadius: "50%", background: "#e53e3e", color: "#fff", fontSize: "0.6rem", fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px", lineHeight: 1 }}>
+          {notifCount > 9 ? "9+" : notifCount}
+        </span>
+      )}
     </button>
-  ) : null
+  )
 
   // ── HOME — larger branded header ──
   if (isHome) {
diff --git a/components/NotificationsDrawer.js b/components/NotificationsDrawer.js
index f0c75be..40ccc2c 100644
--- a/components/NotificationsDrawer.js
+++ b/components/NotificationsDrawer.js
@@ -1,5 +1,6 @@
 "use client"
 import { useState, useEffect, useCallback } from "react"
+import { useRouter } from "next/navigation"
 import { supabase } from "@/lib/supabase"
 import { useUI } from "@/lib/UIContext"
 
@@ -68,8 +69,27 @@ function typeColour(type) {
   }
 }
 
+// Best-effort mapping from a notification's event to the hub page that
+// covers it. There is no per-event URL/page anywhere in this app (event
+// detail always renders in an in-page slide-out, never its own route), so
+// this is deliberately a landing-page approximation, not a deep link to the
+// exact booking/screening/club post -- flagged rather than pretended away.
+// Notification types with no event_id (club_notice_posted, bar_reconciled)
+// have no navigable target and stay tick-only.
+function targetForNotif(n) {
+  if (n.type?.startsWith("question_")) return "/questions"
+  switch (n.events?.hub_type) {
+    case "movie":    return "/screenings"
+    case "social":   return "/social"
+    case "bookclub": return "/bookclub"
+    case "club":     return "/clubs"
+    default:         return null
+  }
+}
+
 export default function NotificationsDrawer() {
   const { notifOpen, closeNotif, setNotifCount, refreshNotifCount } = useUI()
+  const router = useRouter()
 
   const [mounted,  setMounted]  = useState(false)
   const [animIn,   setAnimIn]   = useState(false)
@@ -80,7 +100,7 @@ export default function NotificationsDrawer() {
     if (notifOpen) {
       setMounted(true)
       requestAnimationFrame(() => requestAnimationFrame(() => setAnimIn(true)))
-      loadAndMarkRead()
+      load()
     } else {
       setAnimIn(false)
       const t = setTimeout(() => setMounted(false), 280)
@@ -88,7 +108,12 @@ export default function NotificationsDrawer() {
     }
   }, [notifOpen])
 
-  const loadAndMarkRead = useCallback(async () => {
+  // Fetches the list only -- no longer marks anything read just for having
+  // been opened (fixed 2026-08-14, see the bellBtn comment in Header.js for
+  // why that was a real bug, not a style choice). An alert now only leaves
+  // the unread count when the resident explicitly acknowledges it: the ✓
+  // tick, or clicking through to its matter via openMatter() below.
+  const load = useCallback(async () => {
     setLoading(true)
     const { data: { session } } = await supabase.auth.getSession()
     if (!session) { setLoading(false); return }
@@ -99,25 +124,42 @@ export default function NotificationsDrawer() {
     if (res.ok) {
       const items = await res.json()
       setNotifs(items || [])
-
-      // Mark all unread as read
-      const unreadIds = (items || []).filter(n => !n.read_at).map(n => n.id)
-      if (unreadIds.length > 0) {
-        await fetch('/api/notifications', {
-          method: 'PATCH',
-          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
-          body: JSON.stringify({ all: true }),
-        })
-        setNotifCount(0)
-      }
     }
     setLoading(false)
-  }, [setNotifCount])
+  }, [])
+
+  // Marks a single notification read -- optimistic locally (both the row's
+  // own state and the header badge count) so the tick feels instant, then
+  // persists via the existing PATCH {ids:[...]} endpoint (already supported
+  // server-side, no API change needed for this fix).
+  const markOne = useCallback(async (id) => {
+    setNotifs(prev => prev.map(n => (n.id === id && !n.read_at) ? { ...n, read_at: new Date().toISOString() } : n))
+    setNotifCount(c => Math.max(0, c - 1))
+    const { data: { session } } = await supabase.auth.getSession()
+    if (!session) return
+    await fetch('/api/notifications', {
+      method: 'PATCH',
+      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
+      body: JSON.stringify({ ids: [id] }),
+    }).catch(() => {})
+    refreshNotifCount()
+  }, [setNotifCount, refreshNotifCount])
+
+  // Clicking the body of a notification (not the tick) acknowledges it AND
+  // navigates to the relevant hub, satisfying Iain's "if they click through
+  // to the matter, that counts as done too" -- so a resident who taps
+  // straight into the event never has to also come back and tick it off.
+  const openMatter = useCallback((n) => {
+    const target = targetForNotif(n)
+    if (!target) return
+    if (!n.read_at) markOne(n.id)
+    closeNotif()
+    router.push(target)
+  }, [markOne, closeNotif, router])
 
   if (!mounted) return null
 
   const unread = notifs.filter(n => !n.read_at)
-  const read   = notifs.filter(n => n.read_at)
 
   return (
     <>
@@ -157,18 +199,24 @@ export default function NotificationsDrawer() {
             </div>
           ) : (
             <div style={{ display: "flex", flexDirection: "column" }}>
-              {/* Unread first (will already be marked read server-side but shown distinctly until next open) */}
+              {/* Unread stays visible (with a tick to dismiss) until acknowledged -- no longer auto-cleared just by opening the drawer */}
               {unread.length > 0 && (
                 <div style={{ padding: "0.5rem 1rem 0.25rem", fontSize: "0.7rem", fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.08em" }}>New</div>
               )}
-              {notifs.map((n, i) => {
+              {notifs.map((n) => {
                 const isNew = !n.read_at
+                const target = targetForNotif(n)
                 return (
-                  <div key={n.id} style={{
-                    display: "flex", gap: "0.75rem", padding: "0.85rem 1rem",
-                    borderBottom: "1px solid var(--border)",
-                    background: isNew ? "rgba(0,128,128,0.04)" : "transparent",
-                  }}>
+                  <div
+                    key={n.id}
+                    onClick={target ? () => openMatter(n) : undefined}
+                    style={{
+                      display: "flex", gap: "0.75rem", padding: "0.85rem 1rem",
+                      borderBottom: "1px solid var(--border)",
+                      background: isNew ? "rgba(0,128,128,0.04)" : "transparent",
+                      cursor: target ? "pointer" : "default",
+                    }}
+                  >
                     <div style={{ fontSize: "1.4rem", flexShrink: 0, lineHeight: 1.2 }}>{typeIcon(n.type)}</div>
                     <div style={{ flex: 1, minWidth: 0 }}>
                       {n.events?.title && (
@@ -179,8 +227,23 @@ export default function NotificationsDrawer() {
                       <div style={{ fontSize: "0.88rem", color: "var(--text)", lineHeight: 1.45 }}>{n.message}</div>
                       <div style={{ fontSize: "0.72rem", color: "var(--text-dim)", marginTop: "0.3rem" }}>{timeAgo(n.created_at)}</div>
                     </div>
-                    {isNew && (
-                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--teal)", flexShrink: 0, marginTop: 6 }} />
+                    {isNew ? (
+                      <button
+                        onClick={(e) => { e.stopPropagation(); markOne(n.id) }}
+                        aria-label="Mark as done"
+                        title="Mark as done"
+                        style={{
+                          flexShrink: 0, alignSelf: "flex-start", marginTop: 2,
+                          width: 26, height: 26, borderRadius: "50%",
+                          border: "1.5px solid var(--teal)", background: "none", color: "var(--teal)",
+                          display: "flex", alignItems: "center", justifyContent: "center",
+                          fontSize: "0.85rem", fontWeight: 800, cursor: "pointer", padding: 0,
+                        }}
+                      >
+                        ✓
+                      </button>
+                    ) : (
+                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--border)", flexShrink: 0, marginTop: 6 }} />
                     )}
                   </div>
                 )
diff --git a/lib/useAdaptiveClamp.js b/lib/useAdaptiveClamp.js
index cb49357..e5f93fa 100644
--- a/lib/useAdaptiveClamp.js
+++ b/lib/useAdaptiveClamp.js
@@ -44,7 +44,6 @@ export function useAdaptiveClamp(sheetRef, bodyRef, textWrapRef, { fontSize, lin
   const [maxLines, setMaxLines] = useState(null)
   const [pass, setPass] = useState("measure") // 'measure' (unclamped, mid-measurement) | 'done'
 
-  // eslint-disable-next-line react-hooks/exhaustive-deps
   useLayoutEffect(() => {
     setPass("measure")
     setMaxLines(null)
