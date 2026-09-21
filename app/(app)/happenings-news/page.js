"use client"
import { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useUser } from "@/lib/UserContext"
import { HappeningsNewsIcon } from "@/components/NavIcons"
import PostSlideOut from "@/components/PostSlideOut"
import ManageLink from "@/components/ManageLink"

// Happenings News hub -- the flat chronological feed (Iain, 2026-09-21:
// "news posts should be sorted in date and time order, not grouped in any
// other way"). Row layout deliberately matches Show Time's Suggestions page
// (app/(app)/library/page.js's MovieCard: fixed-size image or placeholder
// on the left, text in the middle) -- the exact layout Iain asked for.
function PostRow({ post, onOpen }) {
  return (
    <div onClick={onOpen} style={{
      background: "var(--surface)", borderRadius: 12, border: "1px solid var(--border)",
      borderLeft: "3px solid var(--happenings-news)", display: "flex", overflow: "hidden",
      boxShadow: "var(--shadow)", cursor: "pointer", marginBottom: "0.6rem",
    }}>
      {post.primary_photo ? (
        <img src={post.primary_photo.url} alt="" style={{ width: 65, objectFit: "cover", flexShrink: 0 }} />
      ) : (
        <div style={{ width: 65, background: "var(--surface2)", display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0, textAlign: "center" }}>
          <span style={{ fontSize: "0.62rem", color: "var(--text-dim)", opacity: 0.55, fontStyle: "italic" }}>No Image</span>
        </div>
      )}
      <div style={{ flex: 1, padding: "0.6rem 0.75rem", minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
          <span style={{ fontSize: "0.66rem", fontWeight: 700, color: "var(--happenings-news)", background: "var(--happenings-news)15",
            borderRadius: 999, padding: "0.05rem 0.5rem", flexShrink: 0 }}>{post.origin_label}</span>
        </div>
        <div style={{ fontWeight: 700, fontSize: "0.9rem", lineHeight: 1.25, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {post.event?.title || "Event recap"}
        </div>
        <div style={{ color: "var(--text-dim)", fontSize: "0.78rem", marginTop: "0.15rem", overflow: "hidden",
          display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
          {post.content}
        </div>
        <div style={{ color: "var(--text-dim)", fontSize: "0.68rem", marginTop: "0.2rem" }}>
          {post.poster_name} · {new Date(post.created_at).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
        </div>
      </div>
    </div>
  )
}

export default function HappeningsNewsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { isAdmin } = useUser()
  const [posts, setPosts] = useState(null)
  const [activePostId, setActivePostId] = useState(searchParams.get("post") || null)

  useEffect(() => { load() }, [])

  async function load() {
    const json = await fetch("/api/happenings-news").then(r => r.json()).catch(() => ({}))
    setPosts(json.posts || [])
  }

  function openPost(id) {
    setActivePostId(id)
    router.replace(`/happenings-news?post=${id}`)
  }
  function closePost() {
    setActivePostId(null)
    router.replace("/happenings-news")
  }

  return (
    <div style={{ padding: "1.25rem 1rem 6rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
        <span style={{ color: "var(--happenings-news)", display: "flex" }}><HappeningsNewsIcon size={30} /></span>
        <h1 style={{ fontSize: "1.3rem", fontWeight: 800, margin: 0 }}>Happenings News</h1>
      </div>
      <p style={{ color: "var(--text-dim)", fontSize: "0.85rem", margin: "0 0 1rem" }}>
        Recaps written by event coordinators after their events wrap up.
      </p>

      {isAdmin && <ManageLink href="/happenings-news/manage" label="Manage Happenings News" colour="var(--happenings-news)" />}

      {posts === null ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", marginTop: "0.75rem" }}>
          {[1, 2, 3].map(i => <div key={i} style={{ height: 74, borderRadius: 12, background: "var(--surface2)" }} />)}
        </div>
      ) : posts.length === 0 ? (
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "2rem 1rem", textAlign: "center", color: "var(--text-dim)", marginTop: "0.75rem" }}>
          No recaps yet — coordinators can add one once their event has wrapped up.
        </div>
      ) : (
        <div style={{ marginTop: "0.75rem" }}>
          {posts.map(post => <PostRow key={post.id} post={post} onOpen={() => openPost(post.id)} />)}
        </div>
      )}

      {activePostId && (
        <PostSlideOut postId={activePostId} onClose={closePost} onChanged={() => { load(); closePost() }} />
      )}
    </div>
  )
}
