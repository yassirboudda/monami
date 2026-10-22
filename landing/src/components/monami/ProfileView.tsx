import { motion } from "framer-motion";
import { ArrowLeft, Heart, Package, TrendingUp } from "lucide-react";
import { marketplaces, type Product } from "@/data/mock";
import { copy } from "@/lib/copy";
import { eur } from "./charts";
import { ProductThumb, statusStyle } from "./ProductDetail";
import { cn } from "@/lib/utils";

function Row({ p, action }: { p: Product; action?: React.ReactNode }) {
  const s = statusStyle[p.status];
  const m = marketplaces[p.market];
  return (
    <div className="surface flex items-center gap-3 rounded-2xl p-3">
      {p.image ? <ProductThumb src={p.image} alt={p.name} className="size-12 shrink-0 rounded-xl" /> : <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-secondary text-primary"><Package className="size-5" /></div>}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold">{p.name}</div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5", s.cls)}>{s.label}</span>
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <span className="size-2 rounded-full" style={{ background: m?.color }} />
            {m?.name}
          </span>
        </div>
      </div>
      <div className="text-sm font-semibold">{eur(p.listedPrice)}</div>
      {action}
    </div>
  );
}

export function ProfileView({
  items,
  favorites,
  savedOffers = [],
  onToggleFav,
  onBack,
}: {
  items: Product[];
  favorites: string[];
  savedOffers?: Product[];
  onToggleFav: (id: string) => void;
  onBack: () => void;
}) {
  const selling = items.filter((p) => p.status === "listed" || p.status === "messages");
  const soldCount = items.filter((p) => p.status === "sold").length;
  const total = selling.reduce((a, p) => a + p.marketPrice, 0);
  const favs = [...items, ...savedOffers].filter((p) => favorites.includes(p.id));

  return (
    <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 24 }} className="mx-auto w-full max-w-3xl space-y-6 pb-4">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="inline-flex items-center gap-1.5 rounded-full bg-card px-3 py-1.5 text-sm font-medium shadow-sm hover:bg-muted">
          <ArrowLeft className="size-4" /> {copy.back}
        </button>
        <h1 className="text-2xl font-semibold sm:text-3xl">{copy.profile}</h1>
      </div>

      <div className="flex flex-wrap items-center gap-4 py-3">
        <div className="grid size-14 shrink-0 place-items-center rounded-full bg-brand text-lg font-semibold text-primary-foreground">AX</div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold">Alex</div>
          <div className="text-xs text-muted-foreground">{copy.myInventory}</div>
        </div>
        <div className="flex flex-wrap gap-2 text-center">
          <div className="rounded-2xl bg-muted px-4 py-2">
            <div className="text-lg font-semibold">{selling.length}</div>
            <div className="text-[10px] text-muted-foreground">{copy.inSale}</div>
          </div>
          <div className="rounded-2xl bg-muted px-4 py-2">
            <div className="text-lg font-semibold">{soldCount}</div>
            <div className="text-[10px] text-muted-foreground">{copy.soldCount}</div>
          </div>
          <div className="rounded-2xl bg-secondary px-4 py-2">
            <div className="inline-flex items-center gap-1 text-lg font-semibold text-secondary-foreground">
              <TrendingUp className="size-4" /> {eur(total)}
            </div>
            <div className="text-[10px] text-muted-foreground">{copy.estValue}</div>
          </div>
        </div>
      </div>

      <section className="space-y-2">
        <h2 className="inline-flex items-center gap-2 text-sm font-semibold">
          <Package className="size-4 text-primary" /> {copy.myInventory}
        </h2>
        <div className="space-y-2">
          {selling.length === 0 && <p className="text-sm text-muted-foreground">{copy.inventoryEmpty}</p>}
          {selling.map((p) => (
            <Row key={p.id} p={p} />
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="inline-flex items-center gap-2 text-sm font-semibold">
          <Heart className="size-4 text-primary" /> {copy.myFavorites}
        </h2>
        {favs.length === 0 ? (
          <p className="rounded-2xl bg-muted p-4 text-sm text-muted-foreground">{copy.favEmpty}</p>
        ) : (
          <div className="space-y-2">
            {favs.map((p) => (
              <Row
                key={p.id}
                p={p}
                action={
                  <button onClick={() => onToggleFav(p.id)} aria-label={copy.favRemove} className="grid size-8 shrink-0 place-items-center rounded-full text-primary hover:bg-muted">
                    <Heart className="size-4 fill-current" />
                  </button>
                }
              />
            ))}
          </div>
        )}
      </section>
    </motion.div>
  );
}
