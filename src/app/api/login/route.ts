import { NextResponse } from "next/server"
import { SESSION_COOKIE, tokenLooksValid } from "@/lib/session"

const API_UPSTREAM = (process.env.API_UPSTREAM_URL || "http://178.104.100.35").replace(/\/$/, "")

export async function POST(req: Request) {
  const { password } = (await req.json().catch(() => ({}))) as { password?: string }
  let upstream: Response
  try {
    upstream = await fetch(`${API_UPSTREAM}/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: password ?? "" }),
      cache: "no-store",
    })
  } catch {
    return NextResponse.json({ error: "Serveur OctoHandy injoignable" }, { status: 502 })
  }
  const data = (await upstream.json().catch(() => ({}))) as { token?: string; detail?: string; expiresAt?: number }
  if (!upstream.ok || !tokenLooksValid(data.token)) {
    return NextResponse.json({ error: data.detail || "Mot de passe incorrect" }, { status: upstream.status === 401 ? 401 : upstream.status || 502 })
  }
  const res = NextResponse.json({ ok: true })
  res.cookies.set(SESSION_COOKIE, data.token!, { path: "/", sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 30 })
  return res
}
