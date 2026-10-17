import { NextResponse, type NextRequest } from "next/server"
import { SESSION_COOKIE, verifyToken } from "@/lib/session"

const PUBLIC = [/^\/$/, /^\/explore/, /^\/profile/, /^\/chercher/, /^\/inventaire/, /^\/sign-in/, /^\/backend/, /^\/api\/(login|logout)/]

export default function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  const authed = verifyToken(req.cookies.get(SESSION_COOKIE)?.value)
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
