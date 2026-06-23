"use client"
import { createContext, useContext, useEffect, useState, useCallback } from "react"
import { supabase } from "@/lib/supabase"

const UserContext = createContext({
  memberName: "", username: "", isAdmin: false, barOptIn: false,
  memberId: null, member: null, loading: true, refreshUser: () => {},
})

export function UserProvider({ children }) {
  const [user, setUser] = useState({
    memberName: "", username: "", isAdmin: false, barOptIn: false,
    memberId: null, member: null, loading: true,
  })

  const loadUser = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setUser(u => ({ ...u, loading: false })); return }
    // Only select columns that always exist — new profile fields (email, hide_name)
    // are fetched separately by ProfileSlideOver via /api/profile
    const { data } = await supabase
      .from("members")
      .select("id, name, username, is_admin, bar_opt_in, avatar_url")
      .eq("auth_id", session.user.id)
      .single()
    if (data) {
      setUser({
        memberName: data.name, username: data.username,
        isAdmin: data.is_admin, barOptIn: data.bar_opt_in,
        memberId: data.id,
        member: { id: data.id, name: data.name, username: data.username,
                  is_admin: data.is_admin, bar_opt_in: data.bar_opt_in, avatar_url: data.avatar_url },
        loading: false,
      })
    } else {
      setUser(u => ({ ...u, loading: false }))
    }
  }, [])

  useEffect(() => { loadUser() }, [loadUser])

  return (
    <UserContext.Provider value={{ ...user, refreshUser: loadUser }}>
      {children}
    </UserContext.Provider>
  )
}

export const useUser = () => useContext(UserContext)
