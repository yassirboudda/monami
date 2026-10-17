"use client"

// Drop-in replacement for the Clerk hooks we used, backed by the mono-user session cookie (see lib/session.ts).
import { useCallback, useMemo, useSyncExternalStore } from "react"

const COOKIE = "oh_session"
const USER = {
  id: process.env.NEXT_PUBLIC_APP_USER_ID || "user_3JyIq3WyP0BS44BhxVz3zz60Gos",
  email: process.env.NEXT_PUBLIC_APP_USER_EMAIL || "yassirboudda@gmail.com",
  firstName: process.env.NEXT_PUBLIC_APP_USER_NAME || "Yassir",
}

function readCookie() {
  if (typeof document === "undefined") return null
  const m = document.cookie.match(new RegExp(`(?:^|; )${COOKIE}=([^;]*)`))
  return m ? decodeURIComponent(m[1]) : null
}
const subscribe = (cb: () => void) => {
  const id = setInterval(cb, 2000)
  return () => clearInterval(id)
}

export function useAuth() {
  const token = useSyncExternalStore(subscribe, readCookie, () => null)
  const getToken = useCallback(async () => readCookie(), [])
  return { getToken, userId: token ? USER.id : null, orgId: null as string | null, isLoaded: true, isSignedIn: !!token }
}

export function useUser() {
  const { isSignedIn } = useAuth()
  const user = useMemo(
    () => (isSignedIn ? { id: USER.id, firstName: USER.firstName, primaryEmailAddress: { emailAddress: USER.email }, emailAddresses: [{ emailAddress: USER.email }] } : null),
    [isSignedIn]
  )
  return { user, isLoaded: true, isSignedIn }
}

export function useClerk() {
  const signOut = useCallback(async ({ redirectUrl = "/" }: { redirectUrl?: string } = {}) => {
    await fetch("/api/logout", { method: "POST" })
    window.location.href = redirectUrl
  }, [])
  return { signOut }
}

export function useOrganization(_opts?: unknown) {
  return { organization: null as { name: string } | null, memberships: null as null | { data: never[]; hasNextPage: boolean; fetchNext: () => Promise<void> }, isLoaded: true }
}
