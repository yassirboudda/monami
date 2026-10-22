import { useEffect, useState } from "react";
import { API_BASE } from "./app-url";

export type Estimate = { marketplace: string; kind: "sold" | "asking"; n: number; median: number | null; p25: number | null; p75: number | null };

/** Real market price for an item from the MonAmi backend (eBay sold comps, cached server-side). null while loading / unknown. */
export function useEstimate(item: string | undefined) {
  const [est, setEst] = useState<Estimate | null>(null);
  useEffect(() => {
    setEst(null);
    const q = (item ?? "").trim();
    if (q.length < 2) return;
    const ctrl = new AbortController();
    fetch(`${API_BASE}/v1/public/market/estimate?q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (j?.estimate?.median != null) setEst(j.estimate as Estimate); })
      .catch(() => {});
    return () => ctrl.abort();
  }, [item]);
  return est;
}
