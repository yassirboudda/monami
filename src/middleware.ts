import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"

const isPublic = createRouteMatcher(["/", "/explore(.*)", "/profile(.*)", "/chercher(.*)", "/inventaire(.*)", "/sign-in(.*)", "/sign-up(.*)", "/backend(.*)"])

const authorizedParties = [
  "https://octohandy.amirelay.com",
  "https://stockflow.amirelay.com",
  "https://stockflow-nine-ashy.vercel.app",
  "http://localhost:3000",
]

export default clerkMiddleware(
  async (auth, req) => {
    const { userId } = await auth()
    if (userId && req.nextUrl.pathname === "/") {
      return NextResponse.redirect(new URL("/dashboard", req.url))
    }
    if (!isPublic(req)) {
      await auth.protect({
        unauthenticatedUrl: new URL("/sign-in", req.url).toString(),
      })
    }
  },
  { authorizedParties }
)

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
}
