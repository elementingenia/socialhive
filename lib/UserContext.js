"use client"
import { createContext, useContext, useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

const UserContext = createContext({
  // flat fields (legacy — used by BottomNav, etc.)
  memberName: "",
  username:   "",
  isAdmin:    false,
  barOptIn:   false,
  memberId:   null,
  // structured object (used by new pages)
  member:  null,
  loading: true,
})

export function UserProvider({ children }) {
  const [user, setUser] = useState({
    memberName: "",
    username:   "",
    isAdmin:    false,
    barOptIn:   false,
    memberId:   null,
    member:     null,
    loading:    true,
  })

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        setUser(u => ({ ...u, loading: false }))
        return
      }
      supabase
        .from("members")
        .select("id, name, username, is_admin, bar_opt_in")
        .eq("auth_id", session.user.id)
        .single()
        .then(({ data }) => {
          if (data) {
            const member = {
              id:         data.id,
              name:       data.name,
              username:   data.username,
              is_admin:   data.is_admin,
              bar_opt_in: data.bar_opt_in,
            }
            setUser({
              // flat (legacy)
              memberName: data.name,
              username:   data.username,
              isAdmin:    data.is_admin,
              barOptIn:   data.bar_opt_in,
              memberId:   data.id,
              // structured
              member,
              loading: false,
            })
          } else {
            setUser(u => ({ ...u, loading: false }))
          }
        })
    })
  }, [])

  return <UserContext.Provider value={user}>{children}</UserContext.Provider>
}

export const useUser = () => useContext(UserContext)
