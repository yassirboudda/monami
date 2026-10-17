// Mono-user access. The password lives ONLY on the Hetzner API (.env APP_ACCESS_PASSWORD); the API returns a signed
// token oh.<exp>.<hmac> that we keep in a cookie and send as Bearer. The web app only checks shape/expiry; the API
// verifies the signature on every call.
export const SESSION_COOKIE = "oh_session"

export function tokenLooksValid(token: string | undefined | null) {
  if (!token) return false
  const [p, exp, sig] = token.split(".")
  return p === "oh" && /^\d+$/.test(exp || "") && /^[0-9a-f]{64}$/.test(sig || "") && Number(exp) > Date.now() / 1000
}
