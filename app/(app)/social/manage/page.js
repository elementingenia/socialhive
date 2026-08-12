"use client"
import ManageAreaScreen from "@/components/ManageAreaScreen"
import HubTextSection from "@/components/HubTextSection"

// Owner self-service "Manage Social" screen (Owner_SelfService_and_
// Library_Hub_Scope_v1, Part A.3).
export default function SocialManagePage() {
  return (
    <ManageAreaScreen contextType="hub" contextKey="social" backHref="/social"
      backLabel="Social" title="Manage Social" colour="var(--terracotta)">
      <HubTextSection sectionKey="social" />
    </ManageAreaScreen>
  )
}
