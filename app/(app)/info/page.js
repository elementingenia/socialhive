"use client"
import { useRouter } from "next/navigation"
import { DocumentsIcon, ContactsIcon } from "@/components/NavIcons"

const COLOUR = "#4e7aab"

function HubCard({ icon: Icon, title, description, path, onClick }) {
  return (
    <div onClick={onClick} style={{
      background: "var(--surface)", borderRadius: 16,
      border: "1px solid var(--border)", boxShadow: "var(--shadow)",
      overflow: "hidden", cursor: "pointer", marginBottom: "1rem",
    }}>
      <div style={{
        background: COLOUR, padding: "0.6rem 1rem",
        display: "flex", alignItems: "center", gap: "0.6rem",
      }}>
        <span style={{ color: "#fff", display: "flex", alignItems: "center" }}>
          <Icon size={20} />
        </span>
        <span style={{ color: "#fff", fontWeight: 700, fontSize: "0.9rem" }}>{title}</span>
      </div>
      <div style={{ padding: "1rem" }}>
        <p style={{ margin: 0, fontSize: "0.88rem", color: "var(--text-dim)", lineHeight: 1.5 }}>
          {description}
        </p>
        <div style={{
          marginTop: "0.85rem", display: "inline-flex", alignItems: "center",
          gap: "0.3rem", color: COLOUR, fontWeight: 700, fontSize: "0.85rem",
        }}>
          View {title} ›
        </div>
      </div>
    </div>
  )
}

export default function InfoPage() {
  const router = useRouter()
  return (
    <div style={{ padding: "1.25rem 1rem 6rem" }}>
      <HubCard
        icon={DocumentsIcon}
        title="Documents"
        description="Community documents, policies, committee meeting minutes and more — all in one place."
        path="/info/documents"
        onClick={() => router.push("/info/documents")}
      />
      <HubCard
        icon={ContactsIcon}
        title="Contacts"
        description="Key contacts for the community — committee members, Social Hive team, and more."
        path="/info/contacts"
        onClick={() => router.push("/info/contacts")}
      />
    </div>
  )
}
