// Clerk session cookies set on the app host. The web app only gates on them for UX (redirects); the Hetzner API
// verifies the JWT signature on every data call.
export const SESSION_COOKIE = "__session" // short-lived session JWT, refreshed by clerk-js
export const CLIENT_UAT_COOKIE = "__client_uat" // "0" when signed out, a timestamp when a session is active

// Publishable key of the OctoHandy Clerk instance (clerk.amirelay.com). Public by design; env overrides it.
export const CLERK_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || "pk_live_Y2xlcmsuYW1pcmVsYXkuY29tJA"

export function tokenLooksValid(token: string | undefined | null) {
  if (!token) return false
  const parts = token.split(".")
  if (parts.length !== 3) return false
  try {
    const payload = JSON.parse(Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")) as { exp?: number }
    return typeof payload.exp === "number" && payload.exp > Date.now() / 1000
  } catch {
    return false
  }
}

export function signedIn(get: (name: string) => string | undefined) {
  const uat = get(CLIENT_UAT_COOKIE)
  return (!!uat && uat !== "0") || tokenLooksValid(get(SESSION_COOKIE))
}
