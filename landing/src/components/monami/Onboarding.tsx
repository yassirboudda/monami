import { useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, ImagePlus, X } from "lucide-react";
import { customNiche, niches, type Niche } from "@/data/mock";
import { copy } from "@/lib/copy";
import { Mascot } from "./Mascot";
import { MonamiLogo } from "./MonamiLogo";
import { TreeBackground, type TreeStage, type Bloom } from "./tree3d/TreeBackground";
import { cn } from "@/lib/utils";
import { APP_URL } from "@/lib/app-url";

export type Profile = { hasAccount: boolean; niche: Niche; intent: "buy" | "sell"; item: string; photos: string[] };

type Step = "account" | "niche" | "intent" | "detail" | "ready";

const TREE_BY_STEP: Record<Step, TreeStage> = {
  account: "roots",
  niche: "trunk",
  intent: "branch",
  detail: "canopy",
  ready: "canopy",
};

function Bubble({ children }: { children: React.ReactNode }) {
  return <div className="relative min-w-0 rounded-3xl rounded-bl-md bg-card px-4 py-3.5 text-[15px] font-medium shadow-sm sm:px-5 sm:py-4 sm:text-lg">{children}</div>;
}

function MascotRow({ children, big }: { children: React.ReactNode; big?: boolean }) {
  return (
    <div className="flex items-end gap-3 sm:gap-4">
      <Mascot float className={cn("shrink-0 text-ink", big ? "w-20 sm:w-28" : "w-14 sm:w-20")} />
      <motion.div initial={{ opacity: 0, y: 12, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: "spring", stiffness: 200, damping: 20 }}>
        <Bubble>{children}</Bubble>
      </motion.div>
    </div>
  );
}

const fade = { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0, y: -24 } };

export function Onboarding({ onDone }: { onDone: (p: Profile) => void }) {
  const [step, setStep] = useState<Step>("account");
  const [hasAccount, setHasAccount] = useState(false);
  const [niche, setNiche] = useState<Niche>();
  const [intent, setIntent] = useState<"buy" | "sell">();
  const [custom, setCustom] = useState("");
  const [customMode, setCustomMode] = useState(false);
  const [photos, setPhotos] = useState<string[]>([]);
  const [item, setItem] = useState("");
  const [leaving, setLeaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const steps: Step[] = ["account", "niche", "intent", "detail"];
  const stepIdx = Math.min(steps.indexOf(step === "ready" ? "detail" : step), 3);
  const bloom: Bloom = intent === "sell" ? "leaves" : intent === "buy" ? "fruits" : "none";

  const finish = (override?: string) => {
    if (!niche || !intent) return;
    setStep("ready");
    const name = (override ?? item).trim();
    const p: Profile = { hasAccount, niche, intent, item: name || niche.name, photos };
    setTimeout(() => setLeaving(true), 1300);
    setTimeout(() => onDone(p), 2200);
  };

  const suggestions: Record<string, string[]> = {
    pokemon: ["Display 151", "Dracaufeu holo", "Booster Évolutions"],
    gpu: ["RTX 3080", "Ryzen 7 5800X", "RX 6700 XT"],
    sneakers: ["Jordan 1 Mid", "New Balance 550", "Dunk Low Panda"],
  };

  return (
    <motion.div
      className="relative flex min-h-dvh flex-col items-center overflow-x-hidden px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
      animate={leaving ? { scale: 1.6, filter: "blur(24px)", opacity: 0 } : { scale: 1, filter: "blur(0px)", opacity: 1 }}
      transition={{ duration: 0.9, ease: [0.6, 0, 0.4, 1] }}
    >
      <TreeBackground stage={TREE_BY_STEP[step]} bloom={bloom} />

      <header className="relative z-10 flex h-16 w-full max-w-2xl items-center">
        <MonamiLogo className="h-5 text-ink" />
        <div className="ml-auto flex gap-1.5">
          {steps.map((s, i) => (
            <span key={s} className={cn("h-1.5 rounded-full transition-all", i <= stepIdx ? "w-6 bg-primary" : "w-1.5 bg-card/70")} />
          ))}
        </div>
      </header>

      <div className="relative z-10 flex w-full max-w-2xl flex-1 flex-col justify-center gap-8 pb-16">
        <AnimatePresence mode="wait">
          {step === "account" && (
            <motion.div key="account" {...fade} className="space-y-8">
              <MascotRow big>
                <div>
                  {copy.obHello}
                  <div className="mt-2 text-muted-foreground">{copy.obAccount}</div>
                </div>
              </MascotRow>
              <div className="grid gap-3 sm:grid-cols-2 sm:pl-28">
                {[
                  { label: copy.obLogin, v: true },
                  { label: copy.obSignup, v: false },
                ].map((o, i) => (
                  <motion.button
                    key={o.label}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.25 + i * 0.1 }}
                    onClick={() => {
                      if (o.v) {
                        window.location.href = `${APP_URL}/sign-in`;
                        return;
                      }
                      setHasAccount(o.v);
                      setStep("niche");
                    }}
                    className="surface rounded-2xl px-5 py-4 text-left text-sm font-semibold transition hover:-translate-y-0.5 hover:border-primary hover:text-primary"
                  >
                    {o.label}
                  </motion.button>
                ))}
              </div>
            </motion.div>
          )}

          {step === "niche" && (
            <motion.div key="niche" {...fade} className="space-y-8">
              <MascotRow>{copy.obNiche}</MascotRow>
              <div className="grid gap-3 sm:grid-cols-2 sm:pl-28">
                {niches.map((n, i) => (
                  <motion.button
                    key={n.id}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 + i * 0.08 }}
                    onClick={() => {
                      setNiche(n);
                      setStep("intent");
                    }}
                    className="surface flex items-center gap-3 rounded-2xl px-5 py-4 text-left transition hover:-translate-y-0.5 hover:border-primary"
                  >
                    <span className="text-2xl">{n.emoji}</span>
                    <span className="text-sm font-semibold">{n.name}</span>
                    <ArrowRight className="ml-auto size-4 text-muted-foreground" />
                  </motion.button>
                ))}
                <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }} className={cn("surface rounded-2xl px-5 py-4", customMode && "border-primary")}>
                  {customMode ? (
                    <form
                      className="flex items-center gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (custom.trim()) {
                          setNiche(customNiche(custom.trim()));
                          setStep("intent");
                        }
                      }}
                    >
                      <input autoFocus value={custom} onChange={(e) => setCustom(e.target.value)} placeholder={copy.obNicheCustomPlaceholder} className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
                      <button type="submit" disabled={!custom.trim()} className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground transition hover:scale-105 disabled:opacity-40" aria-label={copy.obContinue}>
                        <ArrowRight className="size-4" />
                      </button>
                    </form>
                  ) : (
                    <button onClick={() => setCustomMode(true)} className="flex w-full items-center gap-3 text-left">
                      <span className="text-2xl">✨</span>
                      <span className="text-sm font-semibold">{copy.obNicheCustom}</span>
                      <ArrowRight className="ml-auto size-4 text-muted-foreground" />
                    </button>
                  )}
                </motion.div>
              </div>
            </motion.div>
          )}

          {step === "intent" && niche && (
            <motion.div key="intent" {...fade} className="space-y-8">
              <MascotRow>{copy.obIntent}</MascotRow>
              <div className="grid gap-3 sm:grid-cols-2 sm:pl-28">
                {(
                  [
                    { v: "sell" as const, label: copy.obSell, sub: copy.obSellSub, emoji: "📸" },
                    { v: "buy" as const, label: copy.obBuy, sub: copy.obBuySub, emoji: "🔍" },
                  ] as const
                ).map((o, i) => (
                  <motion.button
                    key={o.v}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 + i * 0.1 }}
                    onClick={() => {
                      setIntent(o.v);
                      setStep("detail");
                    }}
                    className="surface group rounded-3xl p-5 text-left transition hover:-translate-y-1 hover:border-primary"
                  >
                    <span className="text-3xl">{o.emoji}</span>
                    <div className="mt-3 font-semibold">{o.label}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{o.sub}</div>
                    <div className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-primary">
                      {copy.obContinue} <ArrowRight className="size-3.5 transition group-hover:translate-x-0.5" />
                    </div>
                  </motion.button>
                ))}
              </div>
            </motion.div>
          )}

          {step === "detail" && niche && intent === "sell" && (
            <motion.div key="sell" {...fade} className="space-y-8">
              <MascotRow>{copy.obSellPhotos}</MascotRow>
              <div className="surface space-y-4 rounded-3xl p-5 sm:ml-28">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  multiple
                  hidden
                  onChange={(e) => {
                    const files = Array.from(e.target.files ?? []).slice(0, 4 - photos.length);
                    files.forEach((f) => { const reader = new FileReader(); reader.onload = () => { const src = reader.result; if (typeof src === "string") setPhotos((p) => [...p, src].slice(0, 4)); }; reader.readAsDataURL(f); });
                    e.target.value = "";
                  }}
                />
                <div className="grid grid-cols-4 gap-2">
                  {photos.map((src, i) => (
                    <motion.div key={src} initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="relative aspect-square">
                      <img src={src} alt="" className="size-full rounded-2xl object-cover" />
                      <button onClick={() => setPhotos((p) => p.filter((_, j) => j !== i))} className="absolute -right-1 -top-1 rounded-full bg-foreground p-1 text-background" aria-label="Retirer">
                        <X className="size-3" />
                      </button>
                    </motion.div>
                  ))}
                  {photos.length < 4 && (
                    <button onClick={() => fileRef.current?.click()} className="grid aspect-square place-items-center rounded-2xl border-2 border-dashed border-border text-muted-foreground transition hover:border-primary hover:text-primary" aria-label={copy.upload}>
                      <ImagePlus className="size-6" />
                    </button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{copy.obSellPhotosHint}</p>
                <input value={item} onChange={(e) => setItem(e.target.value)} placeholder={copy.obSellName} className="w-full rounded-full border border-border bg-muted/50 px-4 py-2.5 text-sm outline-none placeholder:text-muted-foreground focus:border-primary" />
                <button onClick={() => finish()} disabled={photos.length === 0} className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary py-2.5 text-sm font-semibold text-primary-foreground shadow-md transition hover:brightness-110 disabled:opacity-40">
                  {copy.obContinue} <ArrowRight className="size-4" />
                </button>
              </div>
            </motion.div>
          )}

          {step === "detail" && niche && intent === "buy" && (
            <motion.div key="buy" {...fade} className="space-y-8">
              <MascotRow>{copy.obBuyWhat}</MascotRow>
              <div className="space-y-3 sm:ml-28">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (item.trim()) finish();
                  }}
                  className="surface flex items-center gap-2 rounded-full p-1.5 pl-5"
                >
                  <input autoFocus value={item} onChange={(e) => setItem(e.target.value)} placeholder={copy.obBuyPlaceholder} className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
                  <button type="submit" disabled={!item.trim()} className="grid size-9 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground transition hover:scale-105 disabled:opacity-40" aria-label={copy.obContinue}>
                    <ArrowRight className="size-4" />
                  </button>
                </form>
                <div className="flex flex-wrap gap-2">
                  {(suggestions[niche.id] ?? []).map((s) => (
                    <button key={s} onClick={() => {
                        setItem(s);
                        finish(s);
                      }} className="rounded-full bg-card px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm transition hover:text-primary">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {step === "ready" && (
            <motion.div key="ready" {...fade}>
              <MascotRow>{copy.obReady}</MascotRow>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
