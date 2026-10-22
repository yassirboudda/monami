import { NextResponse, type NextRequest } from "next/server"
import { signedIn } from "@/lib/session"

const PUBLIC = [/^\/$/, /^\/explore/, /^\/profile/, /^\/chercher/, /^\/inventaire/, /^\/sign-in/, /^\/sign-up/, /^\/backend/, /^\/api\/chat$/]

// Gate on the Clerk cookies only (UX redirects); the Hetzner API verifies the session JWT on every data call.
export default function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl
  const authed = signedIn((name) => req.cookies.get(name)?.value)
  if (authed && (pathname === "/" || pathname.startsWith("/sign-in") || pathname.startsWith("/sign-up"))) {
    return NextResponse.redirect(new URL("/dashboard", req.url))
  }
  if (!authed && !PUBLIC.some((re) => re.test(pathname))) {
    const url = new URL("/sign-in", req.url)
    url.searchParams.set("redirect_url", pathname)
    return NextResponse.redirect(url)
  }
  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)"],
}
