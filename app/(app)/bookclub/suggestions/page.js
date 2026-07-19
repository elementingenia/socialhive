"use client"
import { useEffect } from "react"
import { useRouter } from "next/navigation"

export default function BookClubSuggestionsRedirect() {
  const router = useRouter()
  useEffect(() => { router.replace("/clubs/book-club/suggestions") }, [router])
  return <div style={{ display: "flex", justifyContent: "center", padding: "4rem" }}><div className="spinner" /></div>
}
