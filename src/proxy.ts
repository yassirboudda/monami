import { NextResponse, type NextRequest } from "next/server"
import { SESSION_COOKIE, tokenLooksValid } from "@/lib/session"

const PUBLIC = [/^\/$/, /^\/explore/, /^\/profile/, /^\/chercher/, /^\/inventaire/, /^\/sign-in/, /^\/backend/, /^\/api\/(login|logout|chat)$/]

// Gate on cookie shape/expiry only; the Hetzner API verifies the HMAC on every data call.
export default function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl
  const authed = tokenLooksValid(req.cookies.get(SESSION_COOKIE)?.value)
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
