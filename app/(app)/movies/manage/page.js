"use client"
import { useRouter } from "next/navigation"
import ManageAreaScreen from "@/components/ManageAreaScreen"
import HubTextSection from "@/components/HubTextSection"

// Owner self-service "Manage Show Time" screen (Owner_SelfService_and_
// Library_Hub_Scope_v1, Part A.3) — the three Page Texts sections that
// belong to this hub, standalone outside Admin.
export default function MoviesManagePage() {
  const router = useRouter()
  return (
    <ManageAreaScreen contextType="hub" contextKey="movie" backHref="/movies"
      backLabel="Show Time" title="Manage Show Time" colour="var(--teal)">
      <HubTextSection sectionKey="movies" />
      <HubTextSection sectionKey="movies_suggestions" />
      <HubTextSection sectionKey="movies_dvd" />
    </ManageAreaScreen>
  )
}
