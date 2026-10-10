"use client"
// My Stuff (migration 136, Iain 2026-10-10).
// Scope: "Element Happenings – My Stuff – Scope Answered" (Google Doc,
// Drive folder 0ADckvqFBnPA7Uk9PVA).
//
// Four groups, in this order (agreed): Repeating events, Groups & Clubs,
// People, Documents. A group only shows when it has something in it.
// People and Documents are what the resident pinned (📌); Groups & Clubs and
// repeating events fill in on their own from what they've joined and booked.
// People show exactly as on Info › Contacts (same card, same privacy rules,
// no admin extras). Fully private: only the resident's own items load.
import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { useUser } from "@/lib/UserContext"
import { authedFetch } from "@/lib/getAuthToken"
import ContactCard from "@/components/ContactCard"
import PinButton from "@/components/PinButton"
import { buildContactEntries } from "@/lib/contactEntries"
import { personKey } from "@/lib/myStuff"
import { eventDeepLink } from "@/lib/eventNav"
import { usePins } from "@/lib/usePins"
import { ClubsIcon, MoviesIcon, ContactsIcon, DocumentsIcon } from "@/components/NavIcons"

const COLOUR = "var(--teal)"

function fmtDate(d, t) {
  if (!d) return ""
  const day = new Date(d + "T00:00:00").toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" })
  return t ? `${day} · ${t.slice(0, 5)}` : day
}
function opensInViewer(doc) {
  return /\.(pdf|png|jpe?g|gif|webp)$/i.test(doc?.file_name || "") || /\.pdf(\?|#|$)/i.test(doc?.file_url || "")
}
function docHref(doc) {
  if (!opensInViewer(doc)) return doc.file_url
  const name = doc.file_name || `${doc.title}.pdf`
  return `/documents/view?url=${encodeURIComponent(doc.file_url)}&name=${encodeURIComponent(name)}&color=${encodeURIComponent(COLOUR)}&back=${encodeURIComponent("/my-stuff")}`
}

function Group({ icon, title, children }) {
  return (
    <section style={{ marginBottom: "1.25rem" }}>
      <h2 style={{ display: "flex", alignItems: "center", gap: "0.45rem", fontSize: "0.95rem", fontWeight: 800, margin: "0 0 0.5rem", color: "var(--text)" }}>
        <span style={{ color: COLOUR, lineHeight: 0 }}>{icon}</span>{title}
      </h2>
      {children}
    </section>
  )
}

function Row({ onClick, title, sub }) {
  return (
    <button type="button" onClick={onClick} style={{
      width: "100%", textAlign: "left", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem",
      background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10,
      padding: "0.65rem 0.85rem", marginBottom: "0.4rem", cursor: "pointer", fontFamily: "inherit", color: "var(--text)",
    }}>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "block", fontWeight: 700, fontSize: "0.92rem" }}>{title}</span>
        {sub && <span style={{ display: "block", fontSize: "0.78rem", color: "var(--text-dim)", marginTop: 2 }}>{sub}</span>}
      </span>
      <span style={{ color: "var(--text-dim)", fontSize: "1.1rem", flexShrink: 0 }}>›</span>
    </button>
  )
}

export default function MyStuffPage() {
  const router = useRouter()
  const { member: me } = useUser()
  const { toggle } = usePins()
  const [data, setData] = useState(null)        // { pins, clubs, series }
  const [people, setPeople] = useState([])
  const [documents, setDocuments] = useState([])
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    const res = await authedFetch("/api/my-stuff").catch(() => null)
    const d = res?.ok ? await res.json().catch(() => null) : null
    if (!d) { setError("Couldn't load My Stuff. Please try again."); setData({ pins: [], clubs: [], series: [] }); return }
    setData(d)

    const personKeys = new Set(d.pins.map(personKey).filter(Boolean))
    const docIds = d.pins.filter(p => p.item_type === "document").map(p => p.item_id)

    if (personKeys.size) {
      const [catRes, dir, extra] = await Promise.all([
        supabase.from("contact_categories").select("id, name").eq("active", true),
        authedFetch("/api/info/contacts").then(r => r.ok ? r.json() : null).catch(() => null),
        authedFetch("/api/interests/directory").then(r => r.ok ? r.json() : null).catch(() => null),
      ])
      const residentsId = (catRes.data || []).find(c => c.name.toLowerCase() === "residents")?.id || null
      const contacts = dir?.contacts || []
      const contactByMemberId = {}
      for (const c of contacts) if (c.member_id) contactByMemberId[c.member_id] = c
      // No admin extras in My Stuff (agreed): built as any resident sees it.
      const entries = buildContactEntries({
        members: dir?.members || [], displayContacts: contacts.filter(c => !c.member_id && c.active),
        contactByMemberId, residentsId, isAdmin: false,
        interests: extra?.directory || {}, skills: extra?.skills || {}, me,
      })
      setPeople(entries.filter(e => personKeys.has(e.key)))
    } else {
      setPeople([])
    }

    if (docIds.length) {
      const { data: docs } = await supabase.from("documents")
        .select("id, title, file_url, file_name, active").in("id", docIds).eq("active", true)
      setDocuments((docs || []).sort((a, b) => a.title.localeCompare(b.title)))
    } else {
      setDocuments([])
    }
  }, [me])

  useEffect(() => { load() }, [load])

  // Unpinning from here removes it from the page straight away.
  async function unpinPerson(key) {
    const [t, id] = key.startsWith("m-") ? ["member", key.slice(2)] : ["contact", key.slice(2)]
    setPeople(list => list.filter(e => e.key !== key))
    if (!(await toggle(t, id))) load()
  }
  async function unpinDocument(id) {
    setDocuments(list => list.filter(d => d.id !== id))
    if (!(await toggle("document", id))) load()
  }

  const series = data?.series || []
  const clubs = data?.clubs || []
  const nothing = data && !error && !series.length && !clubs.length && !people.length && !documents.length

  const seriesLink = useMemo(() => (s) => eventDeepLink({
    hubType: s.hub_type, eventId: s.next_event_id, clubId: s.club_id, clubSlug: s.club_slug,
  }) || "/home", [])

  return (
    <div style={{ padding: "1.25rem 1rem 6rem" }}>
      {data === null ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "3rem" }}><div className="spinner" /></div>
      ) : (
        <>
          {error && <div role="alert" style={{ color: "var(--danger)", marginBottom: "1rem" }}>{error}</div>}

          {nothing && (
            <div style={{ background: "var(--surface2)", borderRadius: 12, padding: "1rem 1.1rem", fontSize: "0.92rem", lineHeight: 1.5 }}>
              <strong>Nothing here yet.</strong> Tap <strong>📌 Pin</strong> on a person in Info › Contacts, or on a
              document in Info › Documents, to keep them here. Groups &amp; Clubs you join, and repeating events you
              book, appear here on their own.
            </div>
          )}

          {series.length > 0 && (
            <Group icon={<MoviesIcon size={22} />} title="Repeating events">
              {series.map(s => (
                <Row key={s.series_id} onClick={() => router.push(seriesLink(s))} title={s.name}
                  sub={`Next: ${fmtDate(s.next_date, s.next_time)}${s.club_name ? ` · ${s.club_name}` : ""}`} />
              ))}
            </Group>
          )}

          {clubs.length > 0 && (
            <Group icon={<ClubsIcon size={22} />} title="Groups & Clubs">
              {clubs.map(c => <Row key={c.id} onClick={() => router.push(`/clubs/${c.slug}`)} title={c.name} />)}
            </Group>
          )}

          {people.length > 0 && (
            <Group icon={<ContactsIcon size={22} />} title="People">
              {people.map(e => (
                <ContactCard key={e.key} contact={e} external={e.external} isResident={e.isResident}
                  pinned onTogglePin={() => unpinPerson(e.key)} />
              ))}
            </Group>
          )}

          {documents.length > 0 && (
            <Group icon={<DocumentsIcon size={22} />} title="Documents">
              {documents.map(d => (
                <div key={d.id} style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.4rem" }}>
                  <a href={docHref(d)} {...(opensInViewer(d) ? {} : { target: "_blank", rel: "noreferrer" })}
                    onClick={opensInViewer(d) ? (ev => { ev.preventDefault(); router.push(docHref(d)) }) : undefined}
                    style={{
                      flex: 1, minWidth: 0, display: "block", background: "var(--surface)", border: "1px solid var(--border)",
                      borderRadius: 10, padding: "0.65rem 0.85rem", textDecoration: "none", color: "var(--text)",
                      fontWeight: 700, fontSize: "0.92rem",
                    }}>{d.title}{opensInViewer(d) ? "" : " ↗"}</a>
                  <PinButton pinned onToggle={() => unpinDocument(d.id)} label={d.title} />
                </div>
              ))}
            </Group>
          )}
        </>
      )}
    </div>
  )
}
