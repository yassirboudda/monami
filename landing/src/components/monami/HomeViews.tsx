import { useMemo } from "react";
import { motion } from "framer-motion";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { ArrowRight, Heart, ShieldAlert, TrendingDown, TrendingUp } from "lucide-react";
import { marketplaces, offersFor, platformsFor, series, type Niche, type Offer } from "@/data/mock";
import { Button } from "@/components/ui/button";
import { copy } from "@/lib/copy";
import { ChartTip, eur } from "./charts";
import { cn } from "@/lib/utils";
import { useEstimate } from "@/lib/estimate";

export function SellHome({ niche, item, photo }: { niche: Niche; item: string; photo?: string | undefined }) {
  const data = useMemo(() => series(item + niche.id, niche.study.median, "6M", 0.12), [item, niche]);
  const platforms = platformsFor(niche);
  const est = useEstimate(item);
  const first = data[0]?.value ?? 0;
  const last = est?.median ?? data[data.length - 1]?.value ?? 0;
  const change = first ? Math.round(((last - first) / first) * 100) : 0;
  const up = change >= 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      transition={{ type: "spring", stiffness: 140, damping: 20, delay: 0.3 }}
      className="mx-auto grid max-w-3xl gap-4 py-6 md:grid-cols-[1.4fr_1fr]"
    >
      <div className="surface rounded-3xl p-5">
        <div className="flex items-center gap-3">
          {photo ? <img src={photo} alt="" className="size-12 rounded-2xl object-cover" /> : <span className="text-3xl">{niche.emoji}</span>}
          <div className="min-w-0">
            <div className="text-xs text-muted-foreground">{copy.sellTitle}</div>
            <div className="truncate font-semibold">{item}</div>
          </div>
          <div className="ml-auto text-right">
            <div className="text-2xl font-semibold text-primary">{eur(last)}</div>
            <div className="text-[10px] text-muted-foreground">{est ? `${copy.sellPrice} · ${est.n} ventes eBay réelles` : copy.sellPrice}</div>
          </div>
        </div>
        <div className={cn("mt-4 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold", up ? "bg-success-soft text-success" : "bg-destructive-soft text-destructive")}>
          {up ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />}
          {up ? "+" : ""}
          {change}% · {copy.sellTrend}
        </div>
        <div className="mt-3 h-40">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 6, right: 4, left: 4, bottom: 0 }}>
              <defs>
                <linearGradient id="sellFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="t" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} interval="preserveStartEnd" minTickGap={40} />
              <Tooltip content={<ChartTip />} />
              <Area type="monotone" dataKey="value" stroke="var(--primary)" strokeWidth={2.5} fill="url(#sellFill)" animationDuration={1400} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="surface rounded-3xl p-5">
        <div className="mb-3 text-sm font-semibold">{copy.sellWhere}</div>
        <div className="space-y-2">
          {platforms.map((p, i) => (
            <motion.div
              key={p.id}
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.6 + i * 0.12 }}
              className={cn("flex items-center gap-3 rounded-2xl border px-3 py-2.5", i === 0 ? "border-primary bg-primary/5" : "border-border")}
            >
              <span className="grid size-8 place-items-center rounded-full text-xs font-bold text-primary-foreground" style={{ background: p.color }}>
                {p.name[0]}
              </span>
              <div className="min-w-0">
                <div className="text-sm font-semibold">{p.name}</div>
                <div className="h-1 w-20 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${p.fit}%` }} />
                </div>
              </div>
              {i === 0 ? (
                <span className="ml-auto rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">{copy.sellBest}</span>
              ) : (
                <span className="ml-auto text-xs text-muted-foreground">{p.fit}%</span>
              )}
            </motion.div>
          ))}
        </div>
        <button className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary py-2.5 text-sm font-semibold text-primary-foreground shadow-md transition hover:brightness-110">
          {copy.publish} sur eBay <ArrowRight className="size-4" />
        </button>
      </div>
    </motion.div>
  );
}

/* Buy: offers pop out like fruits around the 3D tree canopy. */
const SLOTS = [
  { x: 14, y: 30 },
  { x: 86, y: 30 },
  { x: 50, y: 16 },
  { x: 12, y: 66 },
  { x: 88, y: 66 },
];

export function BuyHome({ niche, item, favorites = [], onFavorite }: { niche: Niche; item: string; favorites?: string[]; onFavorite?: (offer: Offer) => void }) {
  const offers = useMemo(() => offersFor(item, niche), [item, niche]);
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mx-auto flex h-full max-w-4xl flex-col py-4">
      <div className="mx-auto rounded-full bg-card px-4 py-1.5 text-sm font-semibold shadow-sm">
        {copy.buyTitle} · <span className="text-primary">{item}</span>
      </div>
      <div className="relative mx-auto mt-2 min-h-[420px] w-full flex-1">
        {offers.map((o, i) => {
          const s = SLOTS[i];
          const m = marketplaces[o.market];
          if (!s || !m) return null;
          const tag = o.kind === "deal" ? copy.dealTag : o.kind === "scam" ? copy.scamTag : copy.fairTag;
          return (
            <motion.div
              key={o.id}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 220, damping: 14, delay: 1.4 + i * 0.18 }}
              className="absolute w-32 -translate-x-1/2 -translate-y-1/2 sm:w-44"
              style={{ left: `${s.x}%`, top: `${s.y}%` }}
            >
              <div className={cn("surface rounded-2xl p-3", o.kind === "scam" && "border-destructive")}>
                <div className="flex items-center gap-1.5 text-[11px] font-semibold">
                  <span className="size-2 rounded-full" style={{ background: m.color }} />
                  {m.name}
                  <span className={cn("ml-auto rounded-full px-1.5 py-0.5 text-[9px]", o.kind === "deal" ? "bg-success-soft text-success" : o.kind === "scam" ? "bg-destructive-soft text-destructive" : "bg-muted text-muted-foreground")}>
                    {o.kind === "scam" && <ShieldAlert className="mr-0.5 inline size-2.5" />}
                    {tag}
                  </span>
                </div>
                <div className="mt-1.5 flex items-baseline gap-1.5">
                  <span className="shrink-0 whitespace-nowrap text-lg font-semibold text-primary">{eur(o.price)}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {o.delta > 0 ? "+" : ""}
                    {o.delta}% {copy.vsMarket}
                  </span>
                  <Button variant="ghost" size="icon" className="ml-auto size-6 shrink-0 text-primary" aria-label={favorites.includes(o.id) ? copy.favRemove : copy.favAdd} onClick={() => onFavorite?.(o)}>
                    <Heart className={cn("size-3.5", favorites.includes(o.id) && "fill-current")} />
                  </Button>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}
