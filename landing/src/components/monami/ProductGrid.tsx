import { useState } from "react";
import { motion } from "framer-motion";
import { Heart, MessageCircle, TrendingDown, TrendingUp } from "lucide-react";
import { families, marketplaces, type Product } from "@/data/mock";
import { copy } from "@/lib/copy";
import { eur } from "./charts";
import { ProductDetail, ProductThumb, Spark, statusStyle } from "./ProductDetail";
import { cn } from "@/lib/utils";

export function ProductGrid({
  items,
  pulseId,
  favorites = [],
  onToggleFav,
}: {
  items: Product[];
  pulseId?: string | undefined;
  favorites?: string[];
  onToggleFav?: (id: string) => void;
}) {
  const [filter, setFilter] = useState<string>("all");
  const [sel, setSel] = useState<Product>();

  if (sel)
    return (
      <ProductDetail
        product={sel}
        onBack={() => setSel(undefined)}
        fav={favorites.includes(sel.id)}
        onToggleFav={onToggleFav ? () => onToggleFav(sel.id) : undefined}
      />
    );

  const shown = filter === "all" ? items : items.filter((p) => p.family === filter);
  const total = items.reduce((a, p) => a + p.marketPrice, 0);
  const usedFamilies = Object.keys(families).filter((f) => items.some((p) => p.family === f));

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, y: 40 }} className="mx-auto w-full max-w-6xl space-y-5 pb-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold sm:text-3xl">{copy.inventory}</h1>
          <div className="mt-1 text-sm text-muted-foreground">
            {items.length} {copy.items} · {copy.estValue} <b className="text-foreground">{eur(total)}</b>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {["all", ...usedFamilies].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "rounded-full px-3.5 py-1.5 text-xs font-medium transition",
                filter === f ? "bg-primary text-primary-foreground shadow-sm" : "bg-card text-muted-foreground shadow-sm hover:text-foreground",
              )}
            >
              {f === "all" ? copy.all : `${families[f]!.emoji} ${families[f]!.name}`}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((p, i) => {
          const s = statusStyle[p.status];
          const m = marketplaces[p.market];
          const diff = Math.round(((p.listedPrice - p.marketPrice) / p.marketPrice) * 100);
          const up = diff <= 0;
          return (
            <motion.button
              key={p.id}
              layout
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04, type: "spring", stiffness: 180, damping: 20 }}
              onClick={() => setSel(p)}
              className={cn("surface group flex items-center gap-3 rounded-2xl p-3 text-left transition hover:-translate-y-0.5 hover:shadow-lg", pulseId === p.family && "pulse-ring")}
            >
              <ProductThumb src={p.image} alt={p.name} className="size-14 shrink-0 rounded-xl" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{p.name}</div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
                  <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5", s.cls)}>
                    {p.status === "messages" && <MessageCircle className="size-3" />}
                    {s.label}
                  </span>
                  <span className="inline-flex items-center gap-1 text-muted-foreground">
                    <span className="size-2 rounded-full" style={{ background: m?.color }} />
                    {m?.name}
                  </span>
                </div>
                <div className="mt-1.5 flex items-center gap-2 text-xs">
                  <b>{eur(p.listedPrice)}</b>
                  <span className={cn("inline-flex items-center gap-0.5 font-medium", up ? "text-success" : "text-destructive")}>
                    {up ? <TrendingDown className="size-3" /> : <TrendingUp className="size-3" />}
                    {Math.abs(diff)}% {copy.vsMarket}
                  </span>
                </div>
              </div>
              <Spark p={p} />
              {onToggleFav && (
                <span
                  role="button"
                  tabIndex={0}
                  aria-label={favorites.includes(p.id) ? copy.favRemove : copy.favAdd}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleFav(p.id);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.stopPropagation();
                      onToggleFav(p.id);
                    }
                  }}
                  className={cn(
                    "grid size-8 shrink-0 place-items-center rounded-full transition hover:bg-muted",
                    favorites.includes(p.id) ? "text-primary" : "text-muted-foreground/50 hover:text-primary",
                  )}
                >
                  <Heart className={cn("size-4", favorites.includes(p.id) && "fill-current")} />
                </span>
              )}
            </motion.button>
          );
        })}
      </div>
    </motion.div>
  );
}
