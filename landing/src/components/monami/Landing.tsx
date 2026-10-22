import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Bell, BarChart3, Check, KeyRound, MonitorSmartphone, Search, ShieldAlert, ShieldCheck, Sparkles } from "lucide-react";
import { Mascot } from "./Mascot";
import { MonamiLogo } from "./MonamiLogo";
import { TreeBackground, type TreeStage, type Bloom } from "./tree3d/TreeBackground";
import { useEstimate } from "@/lib/estimate";
import { APP_URL } from "@/lib/app-url";
import { cn } from "@/lib/utils";

/*
 * The public page: the real product, no mock flow. Each chapter pins a stage of the 3D tree
 * (roots → trunk → branch → canopy → fruit → full) as the visitor scrolls; every button goes to the app.
 */

const eur = (n: number) => `${Math.round(n).toLocaleString("fr-FR")} €`;
const SIGN_IN = `${APP_URL}/sign-in`;
const SIGN_UP = `${APP_URL}/sign-up`;

type Chapter = { id: string; stage: TreeStage; bloom: Bloom };
const CHAPTERS: Chapter[] = [
  { id: "hero", stage: "roots", bloom: "none" },
  { id: "price", stage: "trunk", bloom: "leaves" },
  { id: "desktop", stage: "branch", bloom: "leaves" },
  { id: "watch", stage: "fruit", bloom: "fruits" },
  { id: "numbers", stage: "canopy", bloom: "both" },
  { id: "developers", stage: "full", bloom: "both" },
  { id: "plans", stage: "full", bloom: "both" },
];

const PLANS = [
  { name: "Essai", price: "0 $", sub: "sans carte", items: ["30 min de bureau distant", "100k tokens IA", "1 marketplace"], cta: "Commencer gratuitement" },
  { name: "Starter", price: "20 $", sub: "/ mois", items: ["10 h de bureau distant", "500k tokens IA", "2 marketplaces"], cta: "Choisir Starter" },
  { name: "Pro", price: "100 $", sub: "/ mois", items: ["100 h de bureau distant", "5M tokens IA", "Marketplaces illimitées", "Autopilote des réponses"], cta: "Choisir Pro", popular: true },
  { name: "Unlimited", price: "200 $", sub: "/ mois", items: ["Bureau distant 24h/24", "25M tokens IA", "Tout illimité", "Support prioritaire"], cta: "Choisir Unlimited" },
];

function Bubble({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("relative min-w-0 rounded-3xl rounded-bl-md bg-card px-4 py-3.5 text-[15px] font-medium shadow-sm sm:px-5 sm:py-4 sm:text-lg", className)}>{children}</div>;
}

function MascotSays({ children, big }: { children: React.ReactNode; big?: boolean }) {
  return (
    <div className="flex items-end gap-3 sm:gap-4">
      <Mascot float className={cn("shrink-0", big ? "w-20 sm:w-28" : "w-14 sm:w-20")} />
      <motion.div initial={{ opacity: 0, y: 12, scale: 0.96 }} whileInView={{ opacity: 1, y: 0, scale: 1 }} viewport={{ once: true, amount: 0.4 }} transition={{ type: "spring", stiffness: 200, damping: 20 }}>
        <Bubble>{children}</Bubble>
      </motion.div>
    </div>
  );
}

function Intro({ children }: { children: React.ReactNode }) {
  return <div className="max-w-2xl rounded-3xl bg-card/75 p-5 shadow-sm backdrop-blur-md sm:p-7">{children}</div>;
}

function Reveal({ children, className, delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  return (
    <motion.div className={className} initial={{ opacity: 0, y: 28 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.3 }} transition={{ duration: 0.7, delay, ease: [0.2, 0.8, 0.2, 1] }}>
      {children}
    </motion.div>
  );
}

function Section({ id, children, className }: { id: string; children: React.ReactNode; className?: string }) {
  return (
    <section id={id} data-chapter={id} className={cn("relative z-10 mx-auto flex w-full max-w-5xl flex-col justify-center px-4 py-20 sm:px-6 sm:py-28 min-h-[88svh]", className)}>
      {children}
    </section>
  );
}

function Kicker({ children }: { children: React.ReactNode }) {
  return <div className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">{children}</div>;
}

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-2 text-3xl font-semibold leading-tight tracking-tight text-ink sm:text-5xl">{children}</h2>;
}

function Lead({ children }: { children: React.ReactNode }) {
  return <p className="mt-4 max-w-xl text-base text-ink/80 sm:text-lg">{children}</p>;
}

function Feature({ icon: Icon, title, text }: { icon: typeof Search; title: string; text: string }) {
  return (
    <div className="surface rounded-3xl p-5">
      <span className="grid size-10 place-items-center rounded-2xl bg-primary/10 text-primary"><Icon className="size-5" /></span>
      <div className="mt-3 font-semibold">{title}</div>
      <p className="mt-1 text-sm text-muted-foreground">{text}</p>
    </div>
  );
}

const EXAMPLES = ["airpods pro 2", "jordan 1 mid", "display pokémon 151", "rtx 3080", "veste levi's vintage"];

function PriceCheck() {
  const [input, setInput] = useState("");
  const [q, setQ] = useState("airpods pro 2");
  const { res, state } = useEstimate(q);
  const est = res?.estimate;
  return (
    <div className="surface rounded-3xl p-5 sm:p-6">
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (input.trim().length >= 2) setQ(input.trim()); }}>
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Quel objet ? ex. airpods pro 2" className="w-full rounded-full border border-border bg-background py-2.5 pl-9 pr-4 text-sm outline-none focus:border-primary" aria-label="Objet à estimer" />
        </div>
        <button type="submit" className="rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:brightness-110">Estimer</button>
      </form>
      <div className="mt-3 flex flex-wrap gap-2">
        {EXAMPLES.map((s) => (
          <button key={s} type="button" onClick={() => { setInput(s); setQ(s); }} className={cn("rounded-full px-3 py-1 text-xs font-medium shadow-sm transition", q === s ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-primary")}>{s}</button>
        ))}
      </div>
      <div className="mt-5 flex flex-wrap items-end gap-x-6 gap-y-2">
        <div>
          <div className="text-xs text-muted-foreground">Prix médian payé · « {q} »</div>
          <div className="text-4xl font-semibold text-primary">{est?.median != null ? eur(est.median) : state === "loading" ? "…" : "—"}</div>
        </div>
        {est && (
          <div className="text-sm text-muted-foreground">
            <div>{est.n} ventes eBay</div>
            {est.p25 != null && est.p75 != null && <div>moitié entre {eur(est.p25)} et {eur(est.p75)}</div>}
          </div>
        )}
        {state === "error" && <div className="text-sm text-muted-foreground">Rien pour celui-là — essaie un autre nom.</div>}
      </div>
      {res && res.examples.length > 0 && (
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {res.examples.slice(0, 6).map((x, i) => (
            <li key={i} className="flex items-center gap-3 rounded-2xl bg-muted/60 px-3 py-2 text-sm">
              {x.imageUrl ? <img src={x.imageUrl} alt="" className="size-9 rounded-xl object-cover" loading="lazy" /> : <span className="grid size-9 place-items-center rounded-xl bg-card text-xs">eBay</span>}
              <span className="min-w-0 flex-1 truncate">{x.url ? <a href={x.url} target="_blank" rel="noreferrer" className="hover:underline">{x.title}</a> : x.title}</span>
              <span className="font-semibold tabular-nums">{eur(x.price)}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-[11px] text-muted-foreground">Vraies ventes eBay. Dans l'app : Vinted, Leboncoin et la courbe dans le temps.</p>
    </div>
  );
}

export function Landing() {
  const [chapter, setChapter] = useState<Chapter>(CHAPTERS[0]!);
  const ratios = useRef<Record<string, number>>({});

  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>("[data-chapter]"));
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { ratios.current[e.target.getAttribute("data-chapter") ?? ""] = e.intersectionRatio; });
      const best = CHAPTERS.reduce((a, c) => ((ratios.current[c.id] ?? 0) > (ratios.current[a.id] ?? 0) ? c : a), CHAPTERS[0]!);
      setChapter((prev) => (prev.id === best.id ? prev : best));
    }, { threshold: [0, 0.2, 0.4, 0.6, 0.8, 1] });
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <div className="relative overflow-x-clip">
      <div className="fixed inset-0" aria-hidden>
        <TreeBackground stage={chapter.stage} bloom={chapter.bloom} />
      </div>

      <header className="sticky top-0 z-30 flex h-16 items-center px-4 sm:px-6">
        <a href="#hero" aria-label="monami"><MonamiLogo className="h-6 sm:h-7" /></a>
        <nav className="ml-auto flex items-center gap-2">
          <a href={SIGN_IN} className="rounded-full bg-card/90 px-3.5 py-1.5 text-xs font-semibold text-ink shadow-sm backdrop-blur transition hover:bg-card">Me connecter</a>
          <a href={SIGN_UP} className="rounded-full bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm transition hover:brightness-110">Créer mon profil</a>
        </nav>
      </header>

      <Section id="hero" className="min-h-[calc(100svh-4rem)] pt-10">
        <MascotSays big>
          <div>Salut ! Moi c'est monami, ton copain pour la seconde main.</div>
          <div className="mt-2 text-muted-foreground">Un agent qui vend pour toi. Un bureau distant pour tout agent.</div>
        </MascotSays>
        <Reveal className="mt-6 grid gap-3 sm:grid-cols-2 sm:pl-32" delay={0.2}>
          <a href={SIGN_UP} className="group flex flex-col rounded-3xl bg-primary px-5 py-4 text-left text-primary-foreground shadow-md transition hover:brightness-110">
            <span className="text-xs font-medium uppercase tracking-wider opacity-80">Vendeurs</span>
            <span className="mt-1 text-lg font-semibold">L'agent monami tient ta boutique</span>
            <span className="mt-1 text-sm opacity-90">Prix, annonces, réponses. Tu valides.</span>
            <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold">Lancer l'agent <ArrowRight className="size-4 transition group-hover:translate-x-0.5" /></span>
          </a>
          <a href="#developers" className="group flex flex-col rounded-3xl bg-card px-5 py-4 text-left text-ink shadow-md transition hover:bg-card/80">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Développeurs &amp; agents</span>
            <span className="mt-1 text-lg font-semibold">Un bureau distant pour ton propre agent</span>
            <span className="mt-1 text-sm text-muted-foreground">Claude, Cursor, n8n… via MCP ou API.</span>
            <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-primary">Connecter mon agent <ArrowRight className="size-4 transition group-hover:translate-x-0.5" /></span>
          </a>
        </Reveal>
        <Reveal className="mt-5 sm:pl-32" delay={0.3}>
          <div className="inline-flex flex-wrap items-center gap-x-3 gap-y-1 rounded-3xl bg-card/80 py-1.5 pl-1.5 pr-4 shadow-sm backdrop-blur">
            <a href={SIGN_UP} className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:brightness-110">Commencer gratuitement</a>
            <a href={SIGN_IN} className="text-sm font-medium text-ink underline-offset-4 hover:underline">J'ai déjà un compte</a>
            <span className="text-xs text-muted-foreground">30 min offertes · sans carte</span>
          </div>
        </Reveal>
        <Reveal className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-ink/70 sm:pl-32" delay={0.35}>
          {["eBay", "Vinted", "Leboncoin", "Etsy", "Vestiaire Collective"].map((m) => <span key={m} className="rounded-full bg-card/70 px-3 py-1 font-medium backdrop-blur">{m}</span>)}
        </Reveal>
      </Section>

      <Section id="price">
        <Reveal>
          <Intro>
          <Kicker>Le prix du marché, en direct</Kicker>
          <H2>Ce que ça vaut vraiment. Aujourd'hui.</H2>
          <Lead>Le même objet, dix prix. monami lit les ventes réelles.</Lead>
          </Intro>
        </Reveal>
        <Reveal className="mt-8" delay={0.15}><PriceCheck /></Reveal>
      </Section>

      <Section id="desktop">
        <Reveal>
          <Intro>
          <Kicker>Ton agent a son propre ordinateur</Kicker>
          <H2>Il bosse. Tu fermes le capot.</H2>
          <Lead>Un vrai ordinateur cloud, à toi, allumé jour et nuit.</Lead>
          </Intro>
        </Reveal>
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <Reveal delay={0.05}><Feature icon={MonitorSmartphone} title="Bureau distant 24h/24" text="Navigateur + terminal. Tu regardes en direct." /></Reveal>
          <Reveal delay={0.15}><Feature icon={ShieldCheck} title="Tu valides" text="Il propose, tu approuves dans le chat." /></Reveal>
          <Reveal delay={0.25}><Feature icon={KeyRound} title="Clé API + MCP" text="Ton agent ouvre le bureau, lit, clique, tape." /></Reveal>
        </div>
        <Reveal className="mt-6" delay={0.3}>
          <MascotSays>« Publie ma veste à 45 € sur Vinted et eBay » → <span className="text-muted-foreground">Fait.</span></MascotSays>
        </Reveal>
      </Section>

      <Section id="watch">
        <Reveal>
          <Intro>
          <Kicker>Il veille pour toi</Kicker>
          <H2>Trop beau pour être vrai ? Il te le dit.</H2>
          <Lead>Ta niche, chaque annonce suivie. Bonnes affaires et arnaques repérées.</Lead>
          </Intro>
        </Reveal>
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <Reveal delay={0.05}><Feature icon={ShieldAlert} title="Détecteur d'arnaques" text="Signalée, avec la raison." /></Reveal>
          <Reveal delay={0.15}><Feature icon={Bell} title="Bonnes affaires" text="Ton téléphone vibre en secondes." /></Reveal>
          <Reveal delay={0.25}><Feature icon={Sparkles} title="Le bon prix, en photo" text="Il lit l'état, compare, te donne ton prix." /></Reveal>
        </div>
      </Section>

      <Section id="numbers">
        <Reveal>
          <Intro>
          <Kicker>Tes chiffres</Kicker>
          <H2>Ce qu'il a fait. Ce que vaut ton stock.</H2>
          <Lead>Tout est gardé 90 jours, lisible en un coup d'œil.</Lead>
          </Intro>
        </Reveal>
        <Reveal className="mt-8 grid gap-4 sm:grid-cols-2" delay={0.15}>
          <Feature icon={BarChart3} title="Activité jour par jour" text="Par marketplace, avec le temps de réponse." />
          <Feature icon={Search} title="Ton stock face au marché" text="Trop cher ? Pourrait partir plus cher ?" />
        </Reveal>
      </Section>

      <Section id="developers" className="min-h-0">
        <Reveal>
          <Intro>
          <Kicker>Pour les développeurs</Kicker>
          <H2>Un ordinateur cloud pour ton agent.</H2>
          <Lead>Une clé, une config MCP. C'est tout.</Lead>
          </Intro>
        </Reveal>
        <div className="mt-8 grid gap-4 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <Reveal delay={0.1} className="min-w-0">
            <div className="surface min-w-0 rounded-3xl p-5">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">Config MCP (Claude Desktop, Cursor…)</div>
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">streamable HTTP</span>
              </div>
              <pre className="mt-3 overflow-x-auto rounded-2xl bg-ink p-4 font-mono text-[12px] leading-relaxed text-[#f7f2e0]">{`{
  "mcpServers": {
    "monami": {
      "url": "https://app.try-ami.com/backend/v1/mcp",
      "headers": { "Authorization": "Bearer oh_live_…" }
    }
  }
}`}</pre>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {["desktop_session", "desktop_open", "desktop_browser", "desktop_record", "desktop_clipboard", "market_price", "price_alerts", "list_shops", "list_listings", "chat"].map((t) => (
                  <code key={t} className="rounded-full bg-muted px-2 py-0.5 text-[11px]">{t}</code>
                ))}
              </div>
            </div>
          </Reveal>
          <div className="grid gap-4">
            <Reveal delay={0.15}><Feature icon={MonitorSmartphone} title="Isolé par compte" text="Ton profil, ton navigateur, ton terminal." /></Reveal>
            <Reveal delay={0.2}><Feature icon={ShieldCheck} title="Les minutes de ton plan" text="30 min offertes. Unlimited : 24h/24." /></Reveal>
            <Reveal delay={0.25}>
              <div className="surface rounded-3xl p-5">
                <div className="text-sm font-semibold">Propulsé par Aiven</div>
                <p className="mt-1 text-sm text-muted-foreground">PostgreSQL, Kafka, Valkey, ClickHouse. 90 jours, en Europe.</p>
              </div>
            </Reveal>
          </div>
        </div>
      </Section>

      <Section id="plans" className="min-h-0 pb-28">
        <Reveal>
          <Intro>
          <Kicker>Plans</Kicker>
          <H2>Gratuit pour commencer.</H2>
          <Lead>Minutes de bureau + tokens IA par mois. Stripe, sans engagement.</Lead>
          </Intro>
        </Reveal>
        <Reveal className="mt-6" delay={0.1}>
          <div className="surface flex flex-wrap items-center gap-x-5 gap-y-2 rounded-3xl px-5 py-3 text-sm">
            <span className="font-semibold">Chaque bureau distant</span>
            {[["GPU", "NVIDIA A6000 · 48 GB VRAM"], ["CPU", "6 cœurs x86_64"], ["RAM", "48 GB"], ["SSD", "256 GB"], ["", "Navigateur + terminal, isolé par compte"]].map(([k, v]) => (
              <span key={v} className="inline-flex items-center gap-1.5 text-muted-foreground">{k && <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-ink">{k}</span>}{v}</span>
            ))}
          </div>
        </Reveal>
        <div className="mt-6 grid gap-4 md:grid-cols-4">
          {PLANS.map((p, i) => (
            <Reveal key={p.name} delay={i * 0.08}>
              <div className={cn("surface flex h-full flex-col rounded-3xl p-5", p.popular && "ring-2 ring-primary")}>
                <div className="flex items-center justify-between">
                  <div className="font-semibold">{p.name}</div>
                  {p.popular && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">Populaire</span>}
                </div>
                <div className="mt-2 text-3xl font-semibold text-primary">{p.price}<span className="text-sm font-normal text-muted-foreground"> {p.sub}</span></div>
                <ul className="mt-4 space-y-2 text-sm">
                  {p.items.map((it) => <li key={it} className="flex items-start gap-2"><Check className="mt-0.5 size-4 shrink-0 text-primary" />{it}</li>)}
                </ul>
                <a href={SIGN_UP} className={cn("mt-5 rounded-full px-4 py-2.5 text-center text-sm font-semibold transition", p.popular ? "bg-primary text-primary-foreground hover:brightness-110" : "bg-muted text-ink hover:bg-muted/70")}>{p.cta}</a>
              </div>
            </Reveal>
          ))}
        </div>
        <Reveal className="mt-10" delay={0.2}>
          <MascotSays>monami. Ton copain pour la seconde main.</MascotSays>
        </Reveal>
      </Section>

      <footer className="relative z-10 mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 pb-10 text-xs text-ink/70 sm:px-6">
        <MonamiLogo className="h-5" />
        <span>try-ami.com</span>
        <a href={APP_URL} className="hover:text-primary">Ouvrir l'app</a>
        <a href={SIGN_UP} className="hover:text-primary">Créer mon profil</a>
      </footer>
    </div>
  );
}
