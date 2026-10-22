"use client";

import { useUser } from "@/lib/auth";
import { BarChart3, ExternalLink, Heart, Eye, Tag, TrendingDown, TrendingUp } from "lucide-react";
import { useState } from "react";
import { MarketPriceModal } from "@/components/oh/market-price";
import { Badge, Button, Card, EmptyState } from "@/components/ui";
import type { Listing } from "@/lib/store";
import { useWorkspaceResource } from "@/lib/use-workspace-resource";

const statusTone = { active: "green" as const, reserved: "amber" as const, sold: "slate" as const };
const statusLabel = { active: "Live", reserved: "Reserved", sold: "Sold" };

// One brand colour per marketplace, used as the small dot next to its name (Magra's inventory cards).
const MARKET_DOT: Record<string, string> = {
  ebay: "#e53238", vinted: "#09b1ba", leboncoin: "#ec5a13", etsy: "#f1641e", facebook: "#1877f2",
  vestiaire: "#1b1b1b", depop: "#ff2300", zalando: "#ff6900", backmarket: "#2e2e4d", amazon: "#ff9900",
};

/** Market snapshot per listing: what we already know from the cache / price history (no Apify call). */
export type MarketSnapshot = Record<string, { median: number; deltaPct: number | null; n: number; kind: "sold" | "asking"; source: string }>;

export function PricePill({ snap, onCheck }: { snap?: MarketSnapshot[string]; onCheck: () => void }) {
  if (!snap || snap.deltaPct == null) {
    return (
      <Button size="sm" variant="secondary" onClick={onCheck}>
        <BarChart3 className="w-3.5 h-3.5" /> Market price
      </Button>
    );
  }
  const d = snap.deltaPct;
  const over = d > 8;
  const under = d < -8;
  const tone = over ? "bg-destructive/10 text-destructive" : under ? "bg-[var(--horizon)]/20 text-[#2f4f7a]" : "bg-emerald-500/10 text-emerald-700";
  return (
    <button onClick={onCheck} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold tabular-nums transition hover:brightness-95 ${tone}`} title={`Market ${snap.kind === "sold" ? "sold" : "asking"} median ${snap.median.toFixed(0)} € (${snap.n})`}>
      {d >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
      {d > 0 ? "+" : ""}{d}% vs market · {snap.median.toFixed(0)} €
    </button>
  );
}

export function ListingsGrid({ listings, emptyText }: { listings: Listing[]; emptyText?: string }) {
  const { user } = useUser();
  const [priceCheck, setPriceCheck] = useState<Listing | null>(null);
  const snapshot = useWorkspaceResource<{ snapshot: MarketSnapshot }>("/v1/market/snapshot").data?.snapshot ?? {};
  if (!listings.length) {
    return (
      <Card>
        <EmptyState icon={<Tag className="w-6 h-6" />} title="No listings" text={emptyText || "No listings in this shop yet."} />
      </Card>
    );
  }

  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {listings.map((l) => {
        const snap = snapshot[l.id];
        return (
          <Card key={l.id} className="p-4 flex flex-col gap-3 min-w-0 overflow-hidden transition hover:-translate-y-0.5 hover:shadow-md">
            <div className="flex items-start gap-3">
              <div className="size-16 shrink-0 overflow-hidden rounded-2xl bg-muted">
                {l.imageUrl ? (
                  <img src={l.imageUrl.startsWith("/v1/") ? `/backend${l.imageUrl}` : l.imageUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                ) : (
                  <div className="grid h-full w-full place-items-center text-muted-foreground"><Tag className="w-5 h-5" /></div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
                  <span className="size-2 rounded-full" style={{ background: MARKET_DOT[l.marketplace] ?? "var(--horizon)" }} />
                  <span className="capitalize">{l.marketplace}</span>
                  <Badge tone={statusTone[l.status]} className="ml-auto">{statusLabel[l.status]}</Badge>
                </div>
                <p className="mt-1 font-semibold leading-snug line-clamp-2">{l.title}</p>
              </div>
            </div>
            <div className="flex items-end justify-between gap-2">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Your price</div>
                <p className="text-2xl font-semibold tracking-tight tabular-nums text-primary">{l.price.toFixed(0)} €</p>
              </div>
              {snap?.median != null && (
                <div className="text-right">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Market</div>
                  <p className="text-lg font-semibold tabular-nums text-muted-foreground">{snap.median.toFixed(0)} €</p>
                </div>
              )}
            </div>
            <div className="flex items-center gap-3 text-caption tabular-nums">
              <span className="inline-flex items-center gap-1"><Eye className="w-3.5 h-3.5" /> {l.views ?? 0}</span>
              <span className="inline-flex items-center gap-1"><Heart className="w-3.5 h-3.5" /> {l.favorites ?? 0}</span>
              {l.createdBy && <span className="ml-auto truncate">by {l.createdBy === user?.id ? "you" : l.creatorName || "a team member"}</span>}
            </div>
            <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t pt-3">
              {l.url ? (
                <a href={l.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground hover:underline underline-offset-4">
                  <ExternalLink className="w-3.5 h-3.5" /> Open
                </a>
              ) : (
                <span />
              )}
              <PricePill snap={snap} onCheck={() => setPriceCheck(l)} />
            </div>
          </Card>
        );
      })}
      <MarketPriceModal listing={priceCheck} onClose={() => setPriceCheck(null)} />
    </div>
  );
}
