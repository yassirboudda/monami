"use client"

import { Plus, Radio, X } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { Badge, Button, Card, Input } from "@/components/ui"
import { useWorkspaceResource } from "@/lib/use-workspace-resource"
import { cn } from "@/lib/utils"

type Tick = { ts: string; median: number; p25: number | null; p75: number | null; min: number | null; max: number | null; n: number }
type Stream = { id: string; keyword: string; marketplace: string; niche: string; nicheName: string; points: Tick[]; last: Tick | null; changePct: number | null }
type Live = { intervalMinutes: number; hours: number; niches: { id: string; name: string; emoji: string; keywords: string[] }[]; streams: Stream[] }

const eur = (n: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "EUR", maximumFractionDigits: n < 100 ? 2 : 0 }).format(n)
const ago = (ts: string) => { const m = Math.max(0, Math.round((Date.now() - Date.parse(ts)) / 60000)); return m < 1 ? "just now" : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago` }

function LiveChart({ points, up }: { points: Tick[]; up: boolean }) {
  const W = 320, H = 96
  if (points.length < 2) return <div className="h-24 grid place-items-center text-xs text-muted-foreground">Collecting the first points…</div>
  const vals = points.map((p) => p.median)
  const min = Math.min(...vals), max = Math.max(...vals), span = max - min || Math.max(1, max * 0.02)
  const x = (i: number) => (i / (points.length - 1)) * W
  const y = (v: number) => H - 6 - ((v - min) / span) * (H - 12)
  const d = vals.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ")
  const color = up ? "#15803d" : "#b91c1c"
  const lastX = x(points.length - 1), lastY = y(vals[vals.length - 1]!)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-24" preserveAspectRatio="none" aria-hidden>
      <defs><linearGradient id={`g-${up}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={color} stopOpacity={0.25} /><stop offset="1" stopColor={color} stopOpacity={0} /></linearGradient></defs>
      <path d={`${d} L${W},${H} L0,${H} Z`} fill={`url(#g-${up})`} />
      <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" style={{ transition: "d .6s ease" }} />
      <circle cx={lastX} cy={lastY} r={4} fill={color}><animate attributeName="r" values="3;6;3" dur="1.6s" repeatCount="indefinite" /><animate attributeName="opacity" values="1;.4;1" dur="1.6s" repeatCount="indefinite" /></circle>
    </svg>
  )
}

/** Analytics → Live market: stock-style tickers for the niches/keywords the seller follows; refreshes itself. */
export function LiveMarket() {
  const { data, mutate, request } = useWorkspaceResource<{ live: Live }>("/v1/market/ticks?hours=48", { refreshInterval: 20_000 })
  const live = data?.live
  const [kw, setKw] = useState("")
  const [busy, setBusy] = useState<string | null>(null)
  const watchedNiches = new Set((live?.streams ?? []).map((s) => s.niche).filter(Boolean))

  async function follow(body: { niche?: string; keyword?: string }) {
    setBusy(body.niche ?? body.keyword ?? "x")
    try {
      await request("/v1/market/watch", { method: "POST", body })
      await mutate()
      setKw("")
      toast.success("Following — first price point in a minute, then every few minutes.")
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not follow that.") } finally { setBusy(null) }
  }
  async function unfollow(id: string) {
    try { await request(`/v1/market/watch/${id}`, { method: "DELETE" }); await mutate() } catch (e) { toast.error(e instanceof Error ? e.message : "Could not remove it.") }
  }

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Radio className="w-4 h-4 text-destructive" />
        <h2 className="font-medium">Live market</h2>
        <Badge tone="green"><span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse mr-1" />LIVE</Badge>
        <span className="text-xs text-muted-foreground">real sales, one point every {live?.intervalMinutes ?? 15} min, stored on Aiven · also via MCP <code className="rounded bg-muted px-1">market_stream</code></span>
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        {(live?.niches ?? []).map((n) => (
          <button key={n.id} type="button" disabled={busy === n.id || watchedNiches.has(n.id)} onClick={() => void follow({ niche: n.id })}
            className={cn("rounded-full border px-3 py-1 text-xs font-medium transition", watchedNiches.has(n.id) ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted")}>
            {n.emoji} {n.name}
          </button>
        ))}
        <form className="flex gap-1.5 items-center" onSubmit={(e) => { e.preventDefault(); if (kw.trim().length >= 2) void follow({ keyword: kw.trim() }) }}>
          <Input value={kw} onChange={(e) => setKw(e.target.value)} placeholder="any item, e.g. rtx 4090" className="h-8 w-44 text-xs" />
          <Button size="sm" variant="secondary" type="submit" loading={busy === kw.trim()}><Plus className="w-3.5 h-3.5" /> Follow</Button>
        </form>
      </div>
      {live && live.streams.length === 0 && <p className="text-sm text-muted-foreground">Pick a niche or type an item: the chart starts moving on its own.</p>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {(live?.streams ?? []).map((s) => {
          const up = (s.changePct ?? 0) >= 0
          return (
            <div key={s.id} className="rounded-2xl border bg-[#141414] text-white p-3 relative">
              <button type="button" onClick={() => void unfollow(s.id)} aria-label="Stop following" className="absolute right-2 top-2 rounded-full p-1 text-white/50 hover:text-white hover:bg-white/10"><X className="w-3.5 h-3.5" /></button>
              <div className="text-[11px] text-white/60 truncate pr-6">{s.keyword} · {s.marketplace} · {s.nicheName}</div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-2xl font-semibold tabular-nums">{s.last ? eur(s.last.median) : "—"}</span>
                {s.changePct != null && <span className={cn("text-xs font-semibold tabular-nums", up ? "text-emerald-400" : "text-red-400")}>{up ? "▲" : "▼"} {Math.abs(s.changePct)}%</span>}
                {s.last && <span className="ml-auto text-[10px] text-white/50">{s.last.n} sales · {ago(s.last.ts)}</span>}
              </div>
              <LiveChart points={s.points} up={up} />
            </div>
          )
        })}
      </div>
    </Card>
  )
}
