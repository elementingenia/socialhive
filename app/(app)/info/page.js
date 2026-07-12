"use client"
import { useEffect } from "react"
import { useRouter } from "next/navigation"

export default function InfoPage() {
  const router = useRouter()
  useEffect(() => { router.replace("/info/contacts") }, [router])
  return null
}
