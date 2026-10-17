import { NextResponse, type NextRequest } from "next/server"

const COOKIE = "oh_session"
const PUBLIC = [/^\/$/, /^\/explore/, /^\/profile/, /^\/chercher/, /^\/inventaire/, /^\/sign-in/, /^\/backend/, /^\/api\/(login|logout)/]

// Web Crypto so this runs in any runtime; mirrors lib/session.ts (oh.<exp>.<hmacSha256(secret, exp)>).
async function verify(token: string | undefined) {
  const secret = process.env.APP_SESSION_SECRET
  if (!token || !secret) return false
  const [p, exp, sig] = token.split(".")
  if (p !== "oh" || !exp || !sig || Number(exp) < Date.now() / 1000) return false
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(exp)))
  const hex = Array.from(mac, (b) => b.toString(16).padStart(2, "0")).join("")
  return hex === sig
}

export default async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl
  const authed = await verify(req.cookies.get(COOKIE)?.value)
  if (authed && (pathname === "/" || pathname.startsWith("/sign-in"))) {
    return NextResponse.redirect(new URL("/dashboard", req.url))
  }
  if (!authed && !PUBLIC.some((re) => re.test(pathname))) {
    const url = new URL("/sign-in", req.url)
    url.searchParams.set("next", pathname)
    return NextResponse.redirect(url)
  }
  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)"],
}
