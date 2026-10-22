"use client";

import { ExternalLink, TrendingDown, TrendingUp, Minus } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import { Badge, Button, Modal, Skeleton } from "@/components/ui";
import type { Listing } from "@/lib/store";

type Comps = {
  marketplace: string;
  keyword: string;
  kind: "sold" | "asking";
  label: string;
  n: number;
  median: number | null;
  p25: number | null;
  p75: number | null;
  deltaPct: number | null;
  cached: boolean;
  fetchedAt: string;
  examples: {
    title: string;
    price: number;
    currency: string;
    url: string;
    imageUrl: string;
    condition: string;
    date: string;
  }[];
  history: { week: string; median: number; n: number }[];
};

const SOURCES = ["ebay", "vinted", "leboncoin"] as const;

function useComps(listing: Listing, marketplace: string) {
  const { getToken } = useAuth();
  const key = `${listing.id}|${marketplace}`;
  const [result, setResult] = useState<{
    key: string;
    data?: Comps;
    error?: string;
  } | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const token = await getToken();
        const res = await apiFetch<{ comps: Comps }>(
          `/v1/market/comps?listingId=${encodeURIComponent(listing.id)}&marketplace=${marketplace}`,
          { token },
        );
        if (alive) setResult({ key, data: res.comps });
      } catch (e) {
        if (alive)
          setResult({
            key,
            error: (e as Error).message.replace(/^\{"detail":"|"\}$/g, ""),
          });
      }
    })();
    return () => {
      alive = false;
    };
  }, [listing.id, marketplace, key, getToken]);
  const current = result?.key === key ? result : null;
  return { loading: !current, data: current?.data, error: current?.error };
}

function Verdict({ comps, price }: { comps: Comps; price: number }) {
  if (comps.median == null || comps.deltaPct == null) return null;
  const d = comps.deltaPct;
  const tone = d > 15 ? "amber" : d < -15 ? "blue" : "green";
  const Icon = d > 15 ? TrendingUp : d < -15 ? TrendingDown : Minus;
  const text =
    d > 15
      ? `Your price is ${d}% above what buyers pay — consider ${comps.median.toFixed(0)} €`
      : d < -15
        ? `Your price is ${Math.abs(d)}% below the market — you could ask ${comps.median.toFixed(0)} €`
        : "Your price is in line with the market";
  return (
    <div className="flex items-start gap-2 rounded-lg border bg-muted/40 p-3 text-sm">
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0">
        <p className="font-medium">{text}</p>
        <p className="text-caption mt-0.5">
          You: {price.toFixed(0)} € · market median {comps.median.toFixed(0)} €
          · typical range {comps.p25?.toFixed(0)}–{comps.p75?.toFixed(0)} €
        </p>
      </div>
      <Badge tone={tone} className="ml-auto shrink-0">
        {comps.n} {comps.kind === "sold" ? "sales" : "listings"}
      </Badge>
    </div>
  );
}

export function MarketPriceModal({
  listing,
  onClose,
}: {
  listing: Listing | null;
  onClose: () => void;
}) {
  return (
    <Modal
      open={Boolean(listing)}
      onClose={onClose}
      title={listing ? `Market price · ${listing.title}` : "Market price"}
      wide
    >
      {listing && <MarketPanel key={listing.id} listing={listing} />}
    </Modal>
  );
}

function MarketPanel({ listing }: { listing: Listing }) {
  const [source, setSource] = useState<string>("ebay");
  const { loading, data, error } = useComps(listing, source);
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap gap-2">
        {SOURCES.map((s) => (
          <Button
            key={s}
            size="sm"
            variant={s === source ? "primary" : "secondary"}
            onClick={() => setSource(s)}
          >
            {s === "ebay"
              ? "Sold on eBay"
              : s === "vinted"
                ? "Asking on Vinted"
                : "Asking on Leboncoin"}
          </Button>
        ))}
      </div>
      {loading && (
        <div className="grid gap-2">
          <Skeleton className="h-16" />
          <p className="text-caption">
            Looking at recent {source === "ebay" ? "sales" : "listings"} for “
            {listing.title}”… this takes 10–30 s the first time.
          </p>
        </div>
      )}
      {error && <p className="text-sm text-amber-700">{error}</p>}
      {data && !loading && (
        <>
          {data.n === 0 ? (
            <p className="text-sm">
              No comparable {data.kind === "sold" ? "sales" : "listings"} found
              for “{data.keyword}”.
            </p>
          ) : (
            <Verdict comps={data} price={listing.price} />
          )}
          {data.history.length > 1 && (
            <div className="text-caption">
              Trend:{" "}
              {data.history.map((h) => `${h.median.toFixed(0)} €`).join(" → ")}{" "}
              (weekly median from our price history)
            </div>
          )}
          {data.examples.length > 0 && (
            <ul className="divide-y rounded-lg border">
              {data.examples.map((ex, i) => (
                <li key={i} className="flex items-center gap-3 p-2 text-sm">
                  {ex.imageUrl ? (
                    <img
                      src={ex.imageUrl}
                      alt=""
                      className="h-10 w-10 shrink-0 rounded object-cover bg-muted"
                      loading="lazy"
                    />
                  ) : (
                    <div className="h-10 w-10 shrink-0 rounded bg-muted" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate">{ex.title}</p>
                    <p className="text-caption">
                      {[ex.condition, ex.date].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <span className="font-semibold tabular-nums">
                    {ex.price.toFixed(0)} €
                  </span>
                  {ex.url && (
                    <a
                      href={ex.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
          <p className="text-caption">
            {data.label} ·{" "}
            {data.cached ? "from the last few hours" : "fetched just now"} ·
            stored in your price history (Aiven Kafka → ClickHouse).
          </p>
        </>
      )}
    </div>
  );
}
