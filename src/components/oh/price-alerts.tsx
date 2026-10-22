"use client"

import { Bell, ShieldAlert, Sparkles } from "lucide-react"
import Link from "next/link"
import { useEffect, useMemo, useRef, useState } from "react"
import type { MarketSnapshot } from "@/components/listings-grid"
import type { Listing } from "@/lib/store"
import { useWorkspaceResource } from "@/lib/use-workspace-resource"
import { cn } from "@/lib/utils"

/*
 * Price alerts (Magra's top-bar bell): listings priced well above what buyers pay ("overpriced") or
 * well below the market ("you could ask more"), from the cache/history snapshot — never an Apify call.
 */
const THRESHOLD = 8

type Alert = { listing: Listing; median: number; delta: number; kind: "over" | "under" }

export function PriceAlerts({ className }: { className?: string }) {
  const listings = useWorkspaceResource<{ listings: Listing[] }>("/v1/listings").data?.listings
  const snapshot = useWorkspaceResource<{ snapshot: MarketSnapshot }>("/v1/market/snapshot").data?.snapshot
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  const alerts = useMemo<Alert[]>(() => {
    if (!listings || !snapshot) return []
    return listings
      .filter((l) => l.status === "active")
      .flatMap((l) => {
        const s = snapshot[l.id]
        if (!s || s.deltaPct == null || Math.abs(s.deltaPct) < THRESHOLD) return []
        return [{ listing: l, median: s.median, delta: s.deltaPct, kind: s.deltaPct > 0 ? ("over" as const) : ("under" as const) }]
      })
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, 6)
  }, [listings, snapshot])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false)
    }
    addEventListener("mousedown", onDown)
    return () => removeEventListener("mousedown", onDown)
  }, [open])

  return (
    <div ref={box} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={`Price alerts${alerts.length ? ` (${alerts.length})` : ""}`}
        aria-expanded={open}
        className="relative grid size-9 place-items-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
      >
        <Bell className="size-5" />
        {alerts.length > 0 && <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-[var(--horizon)] ring-2 ring-background" />}
      </button>
      {open && (
        <div className="absolute right-0 top-11 z-50 w-[min(22rem,90vw)] space-y-2 rounded-2xl border bg-card p-3 shadow-lg">
          <div className="px-1 text-sm font-semibold">Price alerts</div>
          {alerts.length === 0 ? (
            <p className="px-1 pb-1 text-sm text-muted-foreground">
              Nothing to flag: your live listings are priced like the market, or we have no market data for them yet. Open “Market price” on a listing to fetch some.
            </p>
          ) : (
            alerts.map((a) => <AlertCard key={a.listing.id} a={a} onClose={() => setOpen(false)} />)
          )}
        </div>
      )}
    </div>
  )
}

function AlertCard({ a, onClose }: { a: Alert; onClose: () => void }) {
  const under = a.kind === "under"
  return (
    <div className={cn("flex gap-3 rounded-2xl border p-3", under ? "border-emerald-500/30 bg-emerald-500/10" : "border-destructive/30 bg-destructive/10")}>
      <div className={cn("grid size-8 shrink-0 place-items-center rounded-full text-white", under ? "bg-emerald-600" : "bg-destructive")}>
        {under ? <Sparkles className="size-4" /> : <ShieldAlert className="size-4" />}
      </div>
      <div className="min-w-0 flex-1 text-sm">
        <div className={cn("text-xs font-semibold", under ? "text-emerald-700" : "text-destructive")}>
          {under ? "You could ask more" : "Priced above the market"} · <span className="font-normal text-muted-foreground capitalize">{a.listing.marketplace}</span>
        </div>
        <div className="truncate font-medium">{a.listing.title}</div>
        <div className="text-xs text-muted-foreground tabular-nums">
          <b className="text-foreground">{a.listing.price.toFixed(0)} €</b> · {a.delta > 0 ? "+" : ""}{a.delta}% vs market ({a.median.toFixed(0)} €)
        </div>
      </div>
      <Link href="/dashboard/shops/all" onClick={onClose} className="self-center text-xs font-medium text-primary underline-offset-2 hover:underline">
        See
      </Link>
    </div>
  )
}
