"use client"
import { createContext, useContext, useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

const UserContext = createContext({
  memberName: "",
  username: "",
  isAdmin: false,
  memberId: null,
})

export function UserProvider({ children }) {
  const [user, setUser] = useState({
    memberName: "",
    username: "",
    isAdmin: false,
    memberId: null,
  })

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return
      supabase
        .from("members")
        .select("id, name, username, is_admin")
        .eq("auth_id", session.user.id)
        .single()
        .then(({ data }) => {
          if (data)
            setUser({
              memberName: data.name,
              username: data.username,
              isAdmin: data.is_admin,
              memberId: data.id,
            })
        })
    })
  }, [])

  return <UserContext.Provider value={user}>{children}</UserContext.Provider>
}

export const useUser = () => useContext(UserContext)
