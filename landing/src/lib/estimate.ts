import { useEffect, useState } from "react";
import { API_BASE } from "./app-url";

export type Estimate = { marketplace: string; kind: "sold" | "asking"; n: number; median: number | null; p25: number | null; p75: number | null; min?: number | null; max?: number | null };
export type Example = { title: string; price: number; currency?: string; url?: string; imageUrl?: string; condition?: string; date?: string };
export type EstimateResult = { estimate: Estimate; examples: Example[] };

/** Real market price for an item from the MonAmi backend (eBay sold comps, cached server-side). */
export function useEstimate(item: string | undefined) {
  const [res, setRes] = useState<EstimateResult | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  useEffect(() => {
    setRes(null);
    const q = (item ?? "").trim();
    if (q.length < 2) { setState("idle"); return; }
    setState("loading");
    const ctrl = new AbortController();
    fetch(`${API_BASE}/v1/public/market/estimate?q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j) => { if (j?.estimate?.median != null) { setRes({ estimate: j.estimate as Estimate, examples: (j.examples ?? []) as Example[] }); setState("done"); } else setState("error"); })
      .catch((e) => { if (e?.name !== "AbortError") setState("error"); });
    return () => ctrl.abort();
  }, [item]);
  return { res, state };
}
