"use client"
import { useRouter } from "next/navigation"
import ManageAreaScreen from "@/components/ManageAreaScreen"
import HubTextSection from "@/components/HubTextSection"
import DvdEnrichPanel from "@/components/DvdEnrichPanel"
import FairPickPanel from "@/components/FairPickPanel"

// Owner self-service "Manage Show Time" screen (Owner_SelfService_and_
// Library_Hub_Scope_v1, Part A.3) — the three Page Texts sections that
// belong to this hub, standalone outside Admin, plus DVD enrichment.
export default function MoviesManagePage() {
  const router = useRouter()
  return (
    <ManageAreaScreen contextType="hub" contextKey="movie" backHref="/movies"
      backLabel="Show Time" title="Manage Show Time" colour="var(--teal)">
      {/* Fair Pick ranking for choosing the next film (Iain, 2026-10-26,
          Element_Happenings_ShowTime_Fair_Pick_Scope_v1). First on the
          screen: it's what an Owner comes here for most. */}
      <FairPickPanel />
      <HubTextSection sectionKey="movies" />
      <HubTextSection sectionKey="movies_suggestions" />
      <HubTextSection sectionKey="movies_dvd" />
      {/* DVD Library enrichment, Show Time Owners as well as admins (Admin
          clean-up, Iain 2026-10-10). Same panel as Admin > Show Time > Enrich. */}
      <div style={{ marginTop: "1.5rem" }}>
        <DvdEnrichPanel />
      </div>
    </ManageAreaScreen>
  )
}
