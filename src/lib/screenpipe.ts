"use client"

// screenpipe tourne en local sur la machine de l'utilisateur (API sur :3030).
// Le navigateur l'interroge directement : rien ne quitte l'ordinateur.
import { DEMO_MEMORIES, type ScreenMemory } from "@/lib/demo-data"

const SCREENPIPE_URL = (process.env.NEXT_PUBLIC_SCREENPIPE_URL || "http://localhost:3030").replace(/\/$/, "")

const WATCHED = ["Louboutin", "Longchamp", "Burberry", "Levi's", "Bottega", "Vuitton", "Seiko"]

type SearchHit = {
  type: string
  content: { text?: string; transcription?: string; timestamp?: string; app_name?: string; window_name?: string }
}

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

const when = (iso?: string) =>
  iso
    ? new Date(iso).toLocaleString("fr-FR", { weekday: "long", hour: "2-digit", minute: "2-digit" })
    : "récemment"

/** Produits repérés à l'écran. Retombe sur des données de démo si screenpipe ne répond pas. */
export async function loadScreenMemories(): Promise<{ live: boolean; memories: ScreenMemory[] }> {
  try {
    await get("/health")
    const since = new Date(Date.now() - 7 * 86400_000).toISOString()
    const results = await Promise.all(
      WATCHED.map((brand) =>
        get<{ data: SearchHit[] }>(
          `/search?q=${encodeURIComponent(brand)}&content_type=all&limit=1&start_time=${encodeURIComponent(since)}`,
          4000
        )
          .then((r) => ({ brand, hit: r.data?.[0] }))
          .catch(() => ({ brand, hit: undefined }))
      )
    )
    const memories = results
      .filter((r) => r.hit)
      .map(({ brand, hit }, i) => {
        const text = (hit!.content.text || hit!.content.transcription || "").replace(/\s+/g, " ")
        const at = text.toLowerCase().indexOf(brand.toLowerCase())
        return {
          id: `live${i}`,
          query: brand,
          seenOn: hit!.content.app_name || hit!.content.window_name || "votre écran",
          when: when(hit!.content.timestamp),
          excerpt: `« ${text.slice(Math.max(0, at - 30), at + 60).trim()} »`,
        }
      })
    return { live: true, memories }
  } catch {
    return { live: false, memories: DEMO_MEMORIES }
  }
}
