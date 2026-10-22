import { useState } from "react";
import { motion } from "framer-motion";
import { Area, AreaChart, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowLeft, Heart, Lightbulb, MessageCircle } from "lucide-react";
import { type Product, type Range, priceHint, series, marketplaces } from "@/data/mock";
import { copy } from "@/lib/copy";
import { Card, ChartTip, RangeToggle, eur } from "./charts";
import { cn } from "@/lib/utils";

export const statusStyle = {
  listed: { label: copy.listed, cls: "bg-secondary text-secondary-foreground" },
  sold: { label: copy.sold, cls: "bg-success-soft text-success" },
  messages: { label: copy.messages, cls: "bg-accent/15 text-warning" },
};

export function ProductThumb({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const [err, setErr] = useState(false);
  return err ? (
    <div className={cn("grid place-items-center bg-muted text-lg", className)}>📦</div>
  ) : (
    <img src={src} alt={alt} loading="lazy" onError={() => setErr(true)} className={cn("object-cover", className)} />
  );
}

export function Spark({ p }: { p: Product }) {
  const data = series(p.id, p.marketPrice, "1M");
  const up = data[data.length - 1]!.value >= data[0]!.value;
  const c = up ? "var(--success)" : "var(--destructive)";
  return (
    <div className="h-8 w-20">
      <ResponsiveContainer>
        <AreaChart data={data}>
          <defs>
            <linearGradient id={`sp-${p.id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={c} stopOpacity={0.35} />
              <stop offset="100%" stopColor={c} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area dataKey="value" stroke={c} strokeWidth={1.5} fill={`url(#sp-${p.id})`} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ProductDetail({ product, onBack, fav, onToggleFav }: { product: Product; onBack: () => void; fav?: boolean | undefined; onToggleFav?: (() => void) | undefined }) {
  const [range, setRange] = useState<Range>("6M");
  const prod = series(product.id, product.marketPrice, range).map((d) => ({ ...d, band: [d.min, d.max] }));
  const hint = priceHint(product);
  const s = statusStyle[product.status];
  const m = marketplaces[product.market];

  return (
    <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 24 }} className="mx-auto flex h-full w-full max-w-4xl flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={onBack} className="inline-flex items-center gap-1.5 rounded-full bg-card px-3 py-1.5 text-sm font-medium shadow-sm hover:bg-muted">
          <ArrowLeft className="size-4" /> {copy.back}
        </button>
        <div className="ml-auto">
          <RangeToggle value={range} onChange={setRange} />
        </div>
      </div>

      <div className="surface flex items-center gap-4 p-4">
        <ProductThumb src={product.image} alt={product.name} className="size-16 shrink-0 rounded-2xl" />
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold sm:text-xl">{product.name}</h2>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
            <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5", s.cls)}>
              {product.status === "messages" && <MessageCircle className="size-3" />}
              {s.label}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
              <span className="size-2 rounded-full" style={{ background: m?.color }} />
              {m?.name}
            </span>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {onToggleFav && (
            <button
              onClick={onToggleFav}
              aria-label={fav ? copy.favRemove : copy.favAdd}
              className={cn("grid size-9 place-items-center rounded-full transition hover:bg-muted", fav ? "text-primary" : "text-muted-foreground/50 hover:text-primary")}
            >
              <Heart className={cn("size-5", fav && "fill-current")} />
            </button>
          )}
          <div className="text-right">
            <div className="text-xl font-semibold">{eur(product.listedPrice)}</div>
            <div className="text-xs text-muted-foreground">
              {copy.market} {eur(product.marketPrice)}
            </div>
          </div>
        </div>
      </div>

      <Card title={`${copy.priceOverTime} · ${product.name}`} className="flex min-h-72 flex-1 flex-col">
        <div className="min-h-48 flex-1">
          <ResponsiveContainer>
            <ComposedChart data={prod}>
              <defs>
                <linearGradient id="pband" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--primary-glow)" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="var(--primary-glow)" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="4 4" />
              <XAxis dataKey="t" tickLine={false} axisLine={false} fontSize={11} stroke="var(--muted-foreground)" />
              <YAxis tickLine={false} axisLine={false} fontSize={11} stroke="var(--muted-foreground)" width={40} domain={["auto", "auto"]} />
              <Tooltip content={<ChartTip />} />
              <Area dataKey="band" stroke="none" fill="url(#pband)" />
              <Line type="monotone" dataKey="value" name={copy.median} stroke="var(--primary)" strokeWidth={2.5} dot={false} />
              <ReferenceLine y={product.listedPrice} stroke="var(--accent)" strokeDasharray="6 4" label={{ value: copy.yourPrice, fill: "var(--accent)", fontSize: 11, position: "insideTopRight" }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div className={cn("mt-3 flex items-start gap-2 rounded-xl p-3 text-sm", hint.tone === "warn" ? "bg-accent/15" : hint.tone === "good" ? "bg-success-soft" : "bg-muted")}>
          <Lightbulb className="mt-0.5 size-4 shrink-0 text-warning" />
          {hint.text}
        </div>
      </Card>
    </motion.div>
  );
}
