import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bell, ShieldAlert, Sparkle } from "lucide-react";
import { alerts } from "@/data/mock";
import { copy } from "@/lib/copy";
import { MonamiLogo } from "./MonamiLogo";
import { eur } from "./charts";
import { cn } from "@/lib/utils";
import { APP_URL } from "@/lib/app-url";

export function AlertCard({ a, onClose }: { a: (typeof alerts)[number]; onClose?: () => void }) {
  const deal = a.kind === "deal";
  const diff = Math.round(((a.price - a.market) / a.market) * 100);
  return (
    <div className={cn("flex gap-3 rounded-2xl border p-3", deal ? "border-success/30 bg-success-soft" : "border-destructive/30 bg-destructive-soft")}>
      <div className={cn("grid size-8 shrink-0 place-items-center rounded-full text-primary-foreground", deal ? "bg-success" : "bg-destructive")}>
        {deal ? <Sparkle className="size-4" /> : <ShieldAlert className="size-4" />}
      </div>
      <div className="min-w-0 flex-1 text-sm">
        <div className={cn("text-xs font-semibold", deal ? "text-success" : "text-destructive")}>
          {deal ? copy.goodDeal : copy.scam} · <span className="font-normal text-muted-foreground">{a.ago}</span>
        </div>
        <div className="truncate font-medium">{a.item}</div>
        <div className="text-xs text-muted-foreground">
          <b className="text-foreground">{eur(a.price)}</b> · {diff}% {copy.vsMarket} ({eur(a.market)})
        </div>
      </div>
      <a href="#" onClick={(e) => { e.preventDefault(); onClose?.(); }} className="self-center text-xs font-medium text-primary underline-offset-2 hover:underline">
        {copy.see}
      </a>
    </div>
  );
}

export function TopBar({ onProfile }: { onProfile?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <header className="relative z-30 flex h-14 items-center gap-3 px-4 sm:px-6">
      <MonamiLogo className="h-6 text-ink" />
      <div className="ml-auto flex items-center gap-2">
        <a href={`${APP_URL}/sign-up`} className="hidden rounded-full bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm transition hover:brightness-110 sm:inline-flex">Ouvrir l'app</a>
        <div className="relative">
          <button onClick={() => setOpen(!open)} aria-label={copy.alerts} className="relative grid size-9 place-items-center rounded-full hover:bg-muted">
            <Bell className="size-5" />
            <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-accent ring-2 ring-background" />
          </button>
          <AnimatePresence>
            {open && (
              <motion.div initial={{ opacity: 0, y: -8, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8 }} className="surface absolute right-0 top-11 w-[min(22rem,90vw)] space-y-2 p-3">
                <div className="px-1 text-sm font-semibold">{copy.alerts}</div>
                {alerts.map((a) => (
                  <AlertCard key={a.id} a={a} onClose={() => setOpen(false)} />
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <button onClick={onProfile} aria-label={copy.profile} className="grid size-9 place-items-center rounded-full bg-brand text-sm font-semibold text-primary-foreground transition hover:scale-105">
          AX
        </button>
      </div>
    </header>
  );
}
