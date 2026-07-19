"use client"
import { useEffect } from "react"
import { useRouter } from "next/navigation"

// Book Club now runs on the shared Clubs engine (/clubs/book-club). Kept as a
// redirect so existing bookmarks and muscle memory keep working — Decision #1.
export default function BookClubRedirect() {
  const router = useRouter()
  useEffect(() => { router.replace("/clubs/book-club") }, [router])
  return <div style={{ display: "flex", justifyContent: "center", padding: "4rem" }}><div className="spinner" /></div>
}
