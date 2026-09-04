"use client"
import ManageAreaScreen from "@/components/ManageAreaScreen"
import HubTextSection from "@/components/HubTextSection"

// Owner self-service "Manage Social" screen (Owner_SelfService_and_
// Library_Hub_Scope_v1, Part A.3).
export default function SocialManagePage() {
  return (
    <ManageAreaScreen contextType="hub" contextKey="social" backHref="/social"
      backLabel="Social Hive" title="Manage Social Hive" colour="var(--terracotta)">
      <HubTextSection sectionKey="social" />
    </ManageAreaScreen>
  )
}
