"use client"

import { AnimatePresence, motion } from "framer-motion"
import { Armchair, Bell, Camera, Footprints, Search, Shirt, ShoppingBag, Watch, X } from "lucide-react"
import { Suspense, useEffect, useMemo, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import { toast } from "sonner"
import { cn } from "@/components/ui"
import { Crate } from "@/components/etagere/crate"
import { Octopus } from "@/components/etagere/octopus"
import { SiteNav } from "@/components/etagere/site-nav"
import {
  COLORS,
  CONDITIONS,
  MARKETPLACES,
  MATERIALS,
  marketplaceName,
  searchOffers,
  type Category,
  type Condition,
  type MarketplaceId,
  type Offer,
  type ScreenMemory,
} from "@/lib/demo-data"
import { loadScreenMemories } from "@/lib/screenpipe"

const SEARCH_URL: Record<MarketplaceId, (q: string) => string> = {
  vinted: (q) => `https://www.vinted.fr/catalog?search_text=${q}`,
  leboncoin: (q) => `https://www.leboncoin.fr/recherche?text=${q}`,
  vestiaire: (q) => `https://fr.vestiairecollective.com/search/?q=${q}`,
  zalando: (q) => `https://www.zalando.fr/catalogue/?q=${q}`,
  farfetch: (q) => `https://www.farfetch.com/fr/shopping/search/items.aspx?q=${q}`,
  amazon: (q) => `https://www.amazon.fr/s?k=${q}`,
  ebay: (q) => `https://www.ebay.fr/sch/i.html?_nkw=${q}`,
  depop: (q) => `https://www.depop.com/search/?q=${q}`,
}

const CATEGORY_ICON: Record<Category, typeof Shirt> = {
  chaussures: Footprints,
  sacs: ShoppingBag,
  vestes: Shirt,
  montres: Watch,
  deco: Armchair,
}

const SWATCH: Record<string, string> = {
  noir: "#2b2120",
  nude: "#e3c3a8",
  rouge: "#a8322d",
  bleu: "#5d7f9f",
  marron: "#7a5236",
  beige: "#d9c4a0",
}

const BUDGETS = [100, 300, 500, 1000]

// Disposition de l'étagère : 2 rangées de 4 boîtes.
const SLOT_W = 172
const ROW_H = 168

function Toggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" className="sf-chip" data-on={on} onClick={onClick} aria-pressed={on}>
      {children}
    </button>
  )
}

function OfferCard({ offer, query }: { offer: Offer; query: string }) {
  const Icon = CATEGORY_ICON[offer.category]
  const off = offer.retailPrice && offer.retailPrice > offer.price ? Math.round((1 - offer.price / offer.retailPrice) * 100) : 0
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 24, rotate: -1.5 }}
      animate={{ opacity: 1, y: 0, rotate: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ type: "spring", stiffness: 300, damping: 26 }}
      className="flex flex-col overflow-hidden rounded-[1.4rem] bg-[var(--paper)] shadow-[0_1px_0_rgba(67,48,46,0.08),0_20px_40px_-28px_rgba(67,48,46,0.55)]"
    >
      <div className="relative flex h-40 items-center justify-center" style={{ background: `${SWATCH[offer.color] ?? "#c9b79c"}22` }}>
        <Icon className="h-14 w-14 opacity-70" strokeWidth={1.2} style={{ color: SWATCH[offer.color] ?? "var(--ink)" }} />
        <span className="absolute left-3 top-3 rounded-full bg-[var(--paper)] px-3 py-1 text-[0.78rem] font-semibold">
          {marketplaceName(offer.marketplace)}
        </span>
        <span
          className={cn(
            "absolute right-3 top-3 rounded-full px-3 py-1 text-[0.78rem]",
            offer.condition === "neuf" && "bg-[var(--sky)]",
            offer.condition === "avec défaut" && "bg-[#f3d6c8]",
            offer.condition !== "neuf" && offer.condition !== "avec défaut" && "bg-[var(--butter)]"
          )}
        >
          {offer.condition}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-5">
        <p className="font-semibold leading-snug">{offer.title}</p>
        <p className="text-[0.85rem] text-[var(--ink-soft)]">
          {offer.material}, {offer.color}
          {offer.size ? `, taille ${offer.size}` : ""}
          {offer.postedDaysAgo === 0 ? ", publié aujourd'hui" : `, publié il y a ${offer.postedDaysAgo} j`}
        </p>
        {offer.note ? <p className="text-[0.85rem] italic text-[var(--ink-soft)]">{offer.note}</p> : null}
        <div className="mt-auto flex items-end justify-between gap-3 pt-3">
          <p>
            <span className="serif text-[1.7rem] leading-none">{offer.price} €</span>
            {off > 0 ? <span className="ml-2 text-[0.85rem] text-[var(--ink-soft)]">−{off} % vs neuf</span> : null}
          </p>
          <a
            href={SEARCH_URL[offer.marketplace](encodeURIComponent(query || offer.title))}
            target="_blank"
            rel="noreferrer"
            className="text-[0.85rem] font-semibold underline decoration-[1.5px] underline-offset-4"
          >
            Voir sur {marketplaceName(offer.marketplace)}
          </a>
        </div>
      </div>
    </motion.li>
  )
}

function ChercherInner() {
  const params = useSearchParams()
  const [query, setQuery] = useState("")
  const [submitted, setSubmitted] = useState("")
  const [photo, setPhoto] = useState<string | null>(null)
  const [colors, setColors] = useState<string[]>([])
  const [materials, setMaterials] = useState<string[]>([])
  const [conditions, setConditions] = useState<Condition[]>([])
  const [maxPrice, setMaxPrice] = useState<number | undefined>()
  const [sort, setSort] = useState<"prix" | "recent">("prix")
  const [phase, setPhase] = useState<"idle" | "searching" | "done">("idle")
  const [visiting, setVisiting] = useState(-1)
  const [visited, setVisited] = useState<number[]>([])
  const [memories, setMemories] = useState<ScreenMemory[]>([])
  const [live, setLive] = useState<boolean | null>(null)
  const [alertOn, setAlertOn] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  const toggle = <T,>(list: T[], v: T, set: (x: T[]) => void) => set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

  const results = useMemo(() => {
    if (!submitted) return []
    const r = searchOffers(submitted, { colors, materials, conditions, maxPrice })
    return sort === "prix" ? r : [...r].sort((a, b) => a.postedDaysAgo - b.postedDaysAgo)
  }, [submitted, colors, materials, conditions, maxPrice, sort])

  const countBy = useMemo(() => {
    const c: Partial<Record<MarketplaceId, number>> = {}
    for (const r of results) c[r.marketplace] = (c[r.marketplace] ?? 0) + 1
    return c
  }, [results])

  useEffect(() => {
    loadScreenMemories().then((r) => {
      setLive(r.live)
      setMemories(r.memories)
    })
  }, [])

  function run(q: string) {
    const clean = q.trim()
    if (!clean) return
    setQuery(clean)
    setSubmitted(clean)
    setPhase("searching")
    setVisited([])
    timers.current.forEach(clearTimeout)
    timers.current.length = 0
    timers.current.push(
      ...MARKETPLACES.map((_, i) =>
        setTimeout(() => {
          setVisiting(i)
          setVisited((v) => [...v, i])
        }, 250 + i * 330)
      )
    )
    timers.current.push(
      setTimeout(() => {
        setVisiting(-1)
        setPhase("done")
        document.getElementById("resultats")?.scrollIntoView({ behavior: "smooth", block: "start" })
      }, 250 + MARKETPLACES.length * 330 + 350)
    )
  }

  useEffect(() => {
    const q = params.get("q")
    const pending = timers.current
    const start = q ? setTimeout(() => run(q), 0) : undefined
    return () => {
      clearTimeout(start)
      pending.forEach(clearTimeout)
    }
  }, [params])

  function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setPhoto(URL.createObjectURL(f))
    // Démo : la reconnaissance du modèle sera faite par le backend (modèle vision).
    toast("Photo analysée (démo) : Louboutin So Kate")
    run("Louboutin So Kate")
  }

  const cheapest = results.length ? results.reduce((a, b) => (a.price <= b.price ? a : b)) : null
  const retail = results.find((r) => r.retailPrice)?.retailPrice

  const octoPos = (i: number) => ({ x: (i % 4) * SLOT_W - 40, y: Math.floor(i / 4) * ROW_H - 70 })
  const octo = visiting >= 0 ? octoPos(visiting) : { x: 4 * SLOT_W - 30, y: ROW_H - 70 }

  return (
    <div className="sf bg-[var(--sky-soft)]">
      <SiteNav tone="sky" />

      <section className="relative overflow-hidden bg-[var(--sky)]">
        <div className="grain" />
        <div className="relative mx-auto max-w-[1240px] px-4 pb-10 pt-4 sm:px-8 lg:pb-14">
          <h1 className="serif text-[clamp(2.2rem,5vw,3.8rem)] leading-[1.05]">Qu&apos;est-ce qu&apos;on cherche ?</h1>
          <form
            className="sf-field mt-7 flex items-center gap-2 py-2 pl-5 pr-2"
            onSubmit={(e) => {
              e.preventDefault()
              run(query)
            }}
          >
            <Search className="h-5 w-5 shrink-0 opacity-60" aria-hidden />
            {photo ? (
              <span className="relative shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo} alt="Photo envoyée" className="h-9 w-9 rounded-lg object-cover" />
                <button
                  type="button"
                  onClick={() => setPhoto(null)}
                  className="absolute -right-1.5 -top-1.5 rounded-full bg-[var(--ink)] p-0.5 text-[var(--butter)]"
                  aria-label="Retirer la photo"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ) : null}
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Un modèle, une marque : Louboutin So Kate, trench Burberry…"
              className="min-w-0 flex-1 bg-transparent py-2 text-[1.05rem] outline-none placeholder:text-[var(--ink-soft)]/60"
              aria-label="Article recherché"
            />
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPhoto} />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="rounded-full p-2.5 hover:bg-[rgba(67,48,46,0.06)]"
              aria-label="Chercher avec une photo"
              title="Chercher avec une photo"
            >
              <Camera className="h-5 w-5" />
            </button>
            <button type="submit" className="sf-btn sf-btn-ink !py-2.5">
              <span className="hidden sm:inline">Chercher partout</span>
              <span className="sm:hidden">Chercher</span>
            </button>
          </form>

          <div className="mt-5 flex flex-col gap-3 text-[0.9rem]">
            <div className="flex flex-wrap items-center gap-2">
              <span className="w-20 text-[var(--ink-soft)]">Couleur</span>
              {COLORS.map((c) => (
                <Toggle key={c} on={colors.includes(c)} onClick={() => toggle(colors, c, setColors)}>
                  <span className="h-3 w-3 rounded-full border border-black/10" style={{ background: SWATCH[c] }} />
                  {c}
                </Toggle>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="w-20 text-[var(--ink-soft)]">Matière</span>
              {MATERIALS.map((m) => (
                <Toggle key={m} on={materials.includes(m)} onClick={() => toggle(materials, m, setMaterials)}>
                  {m}
                </Toggle>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="w-20 text-[var(--ink-soft)]">État</span>
              {CONDITIONS.map((c) => (
                <Toggle key={c} on={conditions.includes(c)} onClick={() => toggle(conditions, c, setConditions)}>
                  {c}
                </Toggle>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="w-20 text-[var(--ink-soft)]">Budget</span>
              {BUDGETS.map((b) => (
                <Toggle key={b} on={maxPrice === b} onClick={() => setMaxPrice(maxPrice === b ? undefined : b)}>
                  jusqu&apos;à {b} €
                </Toggle>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1240px] px-4 pt-10 sm:px-8">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="serif text-[1.5rem]">Vu sur votre écran</h2>
          {live === null ? null : (
            <p className="flex items-center gap-2 text-[0.85rem] text-[var(--ink-soft)]">
              <span className={cn("status-dot", live ? "live text-emerald-600 bg-emerald-600" : "bg-[var(--ink-soft)]")} />
              {live ? "screenpipe connecté sur cet ordinateur" : "Exemples : screenpipe n'est pas lancé sur cet ordinateur"}
            </p>
          )}
        </div>
        <div className="hide-scrollbar -mx-4 mt-4 flex gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
          {live && memories.length === 0 ? (
            <p className="text-[0.92rem] text-[var(--ink-soft)]">Aucun article repéré à l&apos;écran cette semaine.</p>
          ) : null}
          {memories.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => run(m.query)}
              className="w-[250px] shrink-0 rounded-2xl bg-[var(--paper)] p-4 text-left transition-transform duration-300 hover:-translate-y-0.5"
            >
              <p className="text-[0.8rem] text-[var(--ink-soft)]">
                {m.seenOn}, {m.when}
              </p>
              <p className="serif mt-1 text-[1.1rem] leading-tight">{m.query}</p>
              <p className="mt-1 line-clamp-2 text-[0.85rem] text-[var(--ink-soft)]">{m.excerpt}</p>
            </button>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-[1240px] px-4 pt-12 sm:px-8" aria-label="Étagère des boutiques">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="serif text-[1.5rem]">L&apos;étagère des boutiques</h2>
          <p className="text-[0.9rem] text-[var(--ink-soft)]" aria-live="polite">
            {phase === "idle" && "Lancez une recherche : Poulpe ouvre chaque boîte."}
            {phase === "searching" && visiting >= 0 && `Poulpe fouille ${MARKETPLACES[visiting].name}…`}
            {phase === "done" && `${results.length} offre${results.length > 1 ? "s" : ""} trouvée${results.length > 1 ? "s" : ""} dans ${Object.keys(countBy).length} boîtes`}
          </p>
        </div>
        <div className="mt-6 overflow-hidden">
          <div className="mx-auto w-[720px] origin-top-left scale-[0.48] -mb-[220px] min-[480px]:scale-[0.62] min-[480px]:-mb-[160px] sm:scale-[0.85] sm:-mb-[60px] md:scale-100 md:mb-0">
            <div className="relative pt-24">
              <motion.div
                className="absolute left-0 top-0 z-30"
                animate={{ x: octo.x, y: octo.y + 96 }}
                transition={{ type: "spring", stiffness: 140, damping: 16 }}
              >
                <Octopus size={110} wave={phase === "done"} />
              </motion.div>
              {[0, 1].map((row) => (
                <div key={row} className="relative" style={{ height: ROW_H }}>
                  <div className="absolute inset-x-0 bottom-[44px] flex">
                    {MARKETPLACES.slice(row * 4, row * 4 + 4).map((m, j) => {
                      const i = row * 4 + j
                      const isOpen = visited.includes(i) && phase !== "idle"
                      const count = countBy[m.id] ?? 0
                      return (
                        <div key={m.id} className="relative flex justify-center" style={{ width: SLOT_W }}>
                          <Crate
                            width={140}
                            height={100}
                            depth={92}
                            open={isOpen}
                            label={
                              <>
                                <span className={cn("serif block truncate", m.name.length > 11 ? "text-[0.72rem]" : "text-[0.88rem]")}>{m.name}</span>
                                <span className="block truncate text-[0.64rem] text-[var(--ink-soft)]">{m.kind}</span>
                              </>
                            }
                            contents={
                              <span
                                className={cn(
                                  "block whitespace-nowrap rounded-full px-3 py-1 text-[0.8rem] font-semibold shadow-md",
                                  count ? "bg-[var(--ink)] text-[var(--butter)]" : "bg-[var(--paper)] text-[var(--ink-soft)]"
                                )}
                              >
                                {count ? `${count} trouvé${count > 1 ? "s" : ""}` : "rien ici"}
                              </span>
                            }
                          />
                        </div>
                      )
                    })}
                  </div>
                  <div className="shelf-plank absolute inset-x-0 bottom-4" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="resultats" className="mx-auto max-w-[1240px] scroll-mt-6 px-4 pb-24 pt-10 sm:px-8">
        <AnimatePresence>
          {phase === "done" ? (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="flex flex-col justify-between gap-5 rounded-[1.6rem] bg-[var(--butter)] p-6 sm:flex-row sm:items-center sm:p-8">
                <div>
                  <h2 className="serif text-[clamp(1.6rem,3vw,2.2rem)] leading-tight">
                    {results.length ? `${results.length} offres pour « ${submitted} »` : `Rien pour « ${submitted} » avec ces filtres`}
                  </h2>
                  {cheapest ? (
                    <p className="mt-2 text-[var(--ink-soft)]">
                      Le moins cher : {cheapest.price} € sur {marketplaceName(cheapest.marketplace)}, {cheapest.condition}.
                      {retail ? ` Prix neuf : ${retail} €.` : ""}
                    </p>
                  ) : (
                    <p className="mt-2 text-[var(--ink-soft)]">Retirez un filtre ou augmentez le budget pour ouvrir plus de boîtes.</p>
                  )}
                </div>
                {results.length ? (
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Toggle on={sort === "prix"} onClick={() => setSort("prix")}>
                      Prix croissant
                    </Toggle>
                    <Toggle on={sort === "recent"} onClick={() => setSort("recent")}>
                      Plus récents
                    </Toggle>
                    <button
                      type="button"
                      className={cn("sf-chip", alertOn && "!bg-[var(--ink)] !text-[var(--butter)]")}
                      onClick={() => {
                        setAlertOn(!alertOn)
                        if (!alertOn && cheapest) toast(`Alerte créée : « ${submitted} » sous ${cheapest.price} €`)
                      }}
                    >
                      <Bell className="h-4 w-4" />
                      {alertOn ? "Alerte activée" : "Créer une alerte prix"}
                    </button>
                  </div>
                ) : null}
              </div>
              <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                <AnimatePresence mode="popLayout">
                  {results.map((r) => (
                    <OfferCard key={r.id} offer={r} query={submitted} />
                  ))}
                </AnimatePresence>
              </ul>
              <p className="mt-8 text-[0.85rem] text-[var(--ink-soft)]">
                Offres d&apos;exemple pour la démo. Les liens ouvrent la vraie recherche sur chaque site.
              </p>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </section>
    </div>
  )
}

export default function ChercherPage() {
  return (
    <Suspense>
      <ChercherInner />
    </Suspense>
  )
}
