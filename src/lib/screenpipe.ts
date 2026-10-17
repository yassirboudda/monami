"use client"

// screenpipe runs locally on the user's machine (API on :3030).
// The browser asks it directly, so nothing leaves the computer.
const SCREENPIPE_URL = (process.env.NEXT_PUBLIC_SCREENPIPE_URL || "http://localhost:3030").replace(/\/$/, "")

const WATCHED = ["Louboutin So Kate", "Longchamp Le Pliage", "Levi's Trucker", "Burberry Kensington", "Seiko"]

export type ScreenMemory = { query: string; seenOn: string }

export const DEMO_MEMORIES: ScreenMemory[] = [
  { query: "Louboutin So Kate", seenOn: "Instagram" },
  { query: "Longchamp Le Pliage", seenOn: "TikTok" },
  { query: "Levi's Trucker", seenOn: "Pinterest" },
]

type SearchHit = { content: { app_name?: string; window_name?: string } }

async function get<T>(path: string, ms = 1500): Promise<T> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), ms)
  try {
    const res = await fetch(`${SCREENPIPE_URL}${path}`, { signal: ctrl.signal })
    if (!res.ok) throw new Error(`screenpipe ${res.status}`)
    return (await res.json()) as T
  } finally {
    clearTimeout(t)
  }
}

/** Products the user looked at this week. Falls back to examples when screenpipe isn't running. */
export async function loadScreenMemories(): Promise<{ live: boolean; memories: ScreenMemory[] }> {
  try {
    await get("/health")
    const since = new Date(Date.now() - 7 * 86400_000).toISOString()
    const hits = await Promise.all(
      WATCHED.map((q) =>
        get<{ data: SearchHit[] }>(`/search?q=${encodeURIComponent(q.split(" ")[0])}&content_type=all&limit=1&start_time=${encodeURIComponent(since)}`, 4000)
          .then((r) => ({ q, hit: r.data?.[0] }))
          .catch(() => ({ q, hit: undefined }))
      )
    )
    return {
      live: true,
      memories: hits.filter((h) => h.hit).map(({ q, hit }) => ({ query: q, seenOn: hit!.content.app_name || hit!.content.window_name || "screen" })),
    }
  } catch {
    return { live: false, memories: DEMO_MEMORIES }
  }
}
