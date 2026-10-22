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
  { id: "plans", stage: "full", bloom: "both" },
];

const PLANS = [
  { name: "Essai", price: "0 $", sub: "sans carte", items: ["30 min de bureau distant", "Chat avec l'agent, 100k tokens IA", "1 marketplace", "Tu valides chaque réponse"], cta: "Commencer gratuitement" },
  { name: "Starter", price: "20 $", sub: "/ mois", items: ["10 h de bureau distant", "500k tokens IA", "2 marketplaces", "Prix du marché sur chaque annonce"], cta: "Choisir Starter" },
  { name: "Pro", price: "100 $", sub: "/ mois", items: ["100 h de bureau distant", "5M tokens IA", "Marketplaces illimitées", "Réponses envoyées pour toi (dans ta limite de remise)"], cta: "Choisir Pro", popular: true },
  { name: "Unlimited", price: "200 $", sub: "/ mois", items: ["Bureau distant allumé 24h/24, tout le mois", "25M tokens IA", "Marketplaces illimitées + autopilote", "Support prioritaire"], cta: "Choisir Unlimited" },
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
            <div>{est.n} ventes eBay récentes</div>
            {est.p25 != null && est.p75 != null && <div>la moitié se vendent entre {eur(est.p25)} et {eur(est.p75)}</div>}
          </div>
        )}
        {state === "error" && <div className="text-sm text-muted-foreground">Pas encore de données pour celui-là — essaie un autre nom, ou demande à l'agent dans l'app.</div>}
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
      <p className="mt-3 text-[11px] text-muted-foreground">Données réelles (ventes eBay), mises en cache 6 h. Dans l'app, l'agent compare aussi Vinted et Leboncoin et suit la courbe dans le temps.</p>
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
    <div className="relative">
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
          <div className="mt-2 text-muted-foreground">Un agent qui connaît le vrai prix de tout, qui a son propre ordinateur et qui vend et répond pour toi — tu valides ce qui compte.</div>
        </MascotSays>
        <Reveal className="mt-6 grid gap-3 sm:grid-cols-2 sm:pl-32" delay={0.2}>
          <a href={SIGN_UP} className="group flex items-center justify-between rounded-3xl bg-primary px-5 py-4 text-left font-semibold text-primary-foreground shadow-md transition hover:brightness-110">
            <span>Créer mon profil<span className="block text-xs font-normal opacity-80">Gratuit · 30 min de bureau distant offertes</span></span>
            <ArrowRight className="size-5 transition group-hover:translate-x-0.5" />
          </a>
          <a href={SIGN_IN} className="flex items-center justify-between rounded-3xl bg-card px-5 py-4 text-left font-semibold text-ink shadow-md transition hover:bg-card/80">
            <span>J'ai déjà un compte<span className="block text-xs font-normal text-muted-foreground">Email + mot de passe</span></span>
            <ArrowRight className="size-5" />
          </a>
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
          <Lead>Le même objet a dix prix différents. monami lit les ventes réelles : chaque nouvelle annonce et chaque vente fait bouger la courbe, tu sais toujours ce que les acheteurs paient.</Lead>
          </Intro>
        </Reveal>
        <Reveal className="mt-8" delay={0.15}><PriceCheck /></Reveal>
      </Section>

      <Section id="desktop">
        <Reveal>
          <Intro>
          <Kicker>Ton agent a son propre ordinateur</Kicker>
          <H2>Il publie, il répond, il navigue. Toi, tu fermes le capot.</H2>
          <Lead>Chaque compte reçoit un bureau distant isolé dans le cloud : navigateur, terminal, allumé jour et nuit. L'agent y publie tes annonces, répond aux acheteurs et met à jour ton stock — depuis une vraie machine, pas une API bricolée.</Lead>
          </Intro>
        </Reveal>
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <Reveal delay={0.05}><Feature icon={MonitorSmartphone} title="Bureau distant 24h/24" text="Ton propre profil Linux, navigateur et terminal. Tu le regardes en direct, tu reprends la main quand tu veux." /></Reveal>
          <Reveal delay={0.15}><Feature icon={ShieldCheck} title="Tu valides avant d'envoyer" text="Réponses aux acheteurs, remises, publications : l'agent propose, tu approuves dans le chat. Au-delà de ta limite de remise, il demande toujours." /></Reveal>
          <Reveal delay={0.25}><Feature icon={KeyRound} title="Clé API + MCP" text="Branche ton propre agent (Claude, Cursor, n8n…) : il ouvre le bureau, lit l'écran, clique, tape, enregistre — avec les mêmes quotas et validations." /></Reveal>
        </div>
        <Reveal className="mt-6" delay={0.3}>
          <MascotSays>Publie ma veste Levi's sur Vinted et eBay à 45 € → <span className="text-muted-foreground">Fait. Elle est en ligne sur les deux, je la retire partout dès qu'elle part.</span></MascotSays>
        </Reveal>
      </Section>

      <Section id="watch">
        <Reveal>
          <Intro>
          <Kicker>Il veille pour toi</Kicker>
          <H2>Trop beau pour être vrai ? Il te dit pourquoi.</H2>
          <Lead>Choisis ta niche — cartes, sneakers, montres, ce que tu aimes. monami suit chaque annonce, repère les bonnes affaires avant les autres et signale les arnaques avec la raison.</Lead>
          </Intro>
        </Reveal>
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <Reveal delay={0.05}><Feature icon={ShieldAlert} title="Détecteur d'arnaques" text="Prix hors marché, vendeur tout neuf, photos réutilisées : l'offre est marquée, avec l'explication en clair." /></Reveal>
          <Reveal delay={0.15}><Feature icon={Bell} title="Bonnes affaires en secondes" text="Une pépite dans ta niche ? Ton téléphone vibre. Tes propres annonces trop chères ou trop basses ? Une alerte aussi." /></Reveal>
          <Reveal delay={0.25}><Feature icon={Sparkles} title="Le bon prix pour le tien" text="Une photo suffit : l'agent lit l'état, compare au marché du moment et te donne un prix pour ton objet, pas une moyenne." /></Reveal>
        </div>
      </Section>

      <Section id="numbers">
        <Reveal>
          <Intro>
          <Kicker>Tes chiffres</Kicker>
          <H2>Ce que l'agent a fait, et ce que vaut ton stock.</H2>
          <Lead>Réponses envoyées, actions sur le bureau, prix demandés face au marché, recherches de prix : tout est stocké 90 jours et lisible en un coup d'œil dans l'app.</Lead>
          </Intro>
        </Reveal>
        <Reveal className="mt-8 grid gap-4 sm:grid-cols-2" delay={0.15}>
          <Feature icon={BarChart3} title="Activité jour par jour" text="Ce que l'agent a fait pour toi, par marketplace, avec son temps de réponse." />
          <Feature icon={Search} title="Ton stock face au marché" text="Prix demandés vs valeur marché, annonces trop chères ou qui pourraient se vendre plus." />
        </Reveal>
      </Section>

      <Section id="plans" className="min-h-0 pb-28">
        <Reveal>
          <Intro>
          <Kicker>Plans</Kicker>
          <H2>Commence gratuitement. Monte quand l'agent te fait gagner du temps.</H2>
          <Lead>Chaque plan donne des minutes de bureau distant et des tokens IA par mois. Paiement sécurisé par Stripe, résiliable à tout moment.</Lead>
          </Intro>
        </Reveal>
        <div className="mt-8 grid gap-4 md:grid-cols-4">
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
