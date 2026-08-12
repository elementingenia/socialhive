"use client"
import ManageAreaScreen from "@/components/ManageAreaScreen"
import HubTextSection from "@/components/HubTextSection"

// Owner self-service "Manage Library" screen (Owner_SelfService_and_
// Library_Hub_Scope_v1, Part A.3).
export default function LibraryManagePage() {
  return (
    <ManageAreaScreen contextType="hub" contextKey="library" backHref="/booklibrary"
      backLabel="Library" title="Manage Library" colour="var(--purple)">
      <HubTextSection sectionKey="library" />
      <HubTextSection sectionKey="library_books" />
    </ManageAreaScreen>
  )
}
