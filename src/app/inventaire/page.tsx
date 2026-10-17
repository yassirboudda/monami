"use client"

import { AnimatePresence, motion } from "framer-motion"
import { Check, Plus } from "lucide-react"
import { useMemo, useState } from "react"
import { toast } from "sonner"
import { cn } from "@/components/ui"
import { Crate } from "@/components/etagere/crate"
import { Octopus } from "@/components/etagere/octopus"
import { SiteNav } from "@/components/etagere/site-nav"
import { DEMO_TASKS, STOCK_BOXES, marketplaceName, type StockBox, type StockItem } from "@/lib/demo-data"

const SLOT_W = 200
const ROW_H = 190
const PER_ROW = 3

const STATUS_STYLE: Record<StockItem["status"], string> = {
  "en ligne": "bg-[var(--sky)]",
  réservé: "bg-[var(--butter)]",
  vendu: "bg-[rgba(67,48,46,0.1)] text-[var(--ink-soft)]",
  "à publier": "bg-[#f3d6c8]",
}

function BoxPanel({ box, onPublish }: { box: StockBox; onPublish: (item: StockItem) => void }) {
  const live = box.items.filter((i) => i.status === "en ligne").length
  return (
    <motion.div
      key={box.id}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ type: "spring", stiffness: 260, damping: 24 }}
      className="rounded-[1.6rem] bg-[var(--paper)] p-6 shadow-[0_24px_50px_-34px_rgba(67,48,46,0.7)] sm:p-7"
    >
      <p className="text-[0.88rem] text-[var(--ink-soft)]">{box.hint}</p>
      <h2 className="serif mt-1 text-[1.9rem] leading-tight">{box.name}</h2>
      <p className="mt-1 text-[0.92rem] text-[var(--ink-soft)]">
        {box.items.length} article{box.items.length > 1 ? "s" : ""}, {live} en ligne
      </p>
      <ul className="mt-5 divide-y divide-[rgba(67,48,46,0.1)]">
        {box.items.map((item, i) => (
          <motion.li
            key={item.id}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.08 * i }}
            className="flex flex-wrap items-center gap-x-4 gap-y-2 py-4"
          >
            <div className="min-w-0 flex-1">
              <p className="font-semibold leading-snug">{item.title}</p>
              <p className="mt-0.5 text-[0.85rem] text-[var(--ink-soft)]">
                {item.on.length ? item.on.map(marketplaceName).join(" et ") : "Pas encore en ligne"}
                {item.views ? `, ${item.views} vues` : ""}
              </p>
            </div>
            <span className="serif text-[1.2rem]">{item.price} €</span>
            {item.status === "à publier" ? (
              <button type="button" onClick={() => onPublish(item)} className="sf-btn sf-btn-ink !px-4 !py-1.5 !text-[0.82rem]">
                Publier
              </button>
            ) : (
              <span className={cn("rounded-full px-3 py-1 text-[0.8rem]", STATUS_STYLE[item.status])}>{item.status}</span>
            )}
          </motion.li>
        ))}
      </ul>
    </motion.div>
  )
}

export default function InventairePage() {
  const [boxes, setBoxes] = useState(STOCK_BOXES)
  const [openId, setOpenId] = useState<string | null>(null)
  const [automated, setAutomated] = useState<string[]>([])

  const stats = useMemo(() => {
    const all = boxes.flatMap((b) => b.items)
    return {
      total: all.length,
      online: all.filter((i) => i.status === "en ligne").length,
      todo: all.filter((i) => i.status === "à publier").length,
      value: all.filter((i) => i.status !== "vendu").reduce((s, i) => s + i.price, 0),
    }
  }, [boxes])

  const openIndex = boxes.findIndex((b) => b.id === openId)
  const openBox = openIndex >= 0 ? boxes[openIndex] : null
  const octo =
    openIndex >= 0
      ? { x: (openIndex % PER_ROW) * SLOT_W - 6, y: Math.floor(openIndex / PER_ROW) * ROW_H + 30 }
      : { x: PER_ROW * SLOT_W - 70, y: -8 }

  function publish(item: StockItem) {
    setBoxes((bs) =>
      bs.map((b) => ({
        ...b,
        items: b.items.map((i) => (i.id === item.id ? { ...i, status: "en ligne", on: ["vinted", "leboncoin"] } : i)),
      }))
    )
    toast(`« ${item.title} » publié sur Vinted et Leboncoin`)
  }

  function addBox() {
    const id = `b${Date.now()}`
    setBoxes((bs) => [...bs, { id, name: "Nouvelle boîte", hint: "À ranger", items: [] }])
    setOpenId(id)
  }

  return (
    <div className="sf bg-[var(--butter-soft)]">
      <SiteNav tone="butter" />

      <section className="mx-auto max-w-[1240px] px-4 pb-6 pt-4 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <h1 className="serif text-[clamp(2.2rem,5vw,3.8rem)] leading-[1.05]">Mon inventaire</h1>
            <p className="mt-3 max-w-[34rem] text-[1.02rem] leading-relaxed text-[var(--ink-soft)]">
              {stats.total} articles rangés dans {boxes.length} boîtes : {stats.online} en ligne, {stats.todo} à publier,{" "}
              {stats.value} € de stock à vendre. Ouvrez une boîte pour voir ce qu&apos;elle contient.
            </p>
          </div>
          <button type="button" onClick={addBox} className="sf-btn sf-btn-line">
            <Plus className="h-4 w-4" />
            Ajouter une boîte
          </button>
        </div>
      </section>

      <section className="mx-auto grid max-w-[1240px] gap-8 px-4 pb-20 pt-6 sm:px-8 lg:grid-cols-[640px_1fr]">
        <div className="overflow-hidden">
          <div
            className="w-[600px] origin-top-left scale-[0.55] -mb-[207px] min-[480px]:scale-[0.72] min-[480px]:-mb-[129px] sm:mx-auto sm:mb-0 sm:scale-100"
          >
            <div className="relative pt-20">
              <motion.div
                className="absolute left-0 top-0 z-30"
                animate={{ x: octo.x, y: octo.y }}
                transition={{ type: "spring", stiffness: 140, damping: 16 }}
              >
                <Octopus size={96} wave={!!openBox} />
              </motion.div>
              {Array.from({ length: Math.ceil(boxes.length / PER_ROW) }).map((_, row) => (
                <div key={row} className="relative" style={{ height: ROW_H }}>
                  <div className="absolute inset-x-0 bottom-[44px] flex">
                    {boxes.slice(row * PER_ROW, row * PER_ROW + PER_ROW).map((b) => (
                      <div key={b.id} className="relative flex justify-center" style={{ width: SLOT_W }}>
                        <Crate
                          width={160}
                          height={112}
                          depth={100}
                          open={openId === b.id}
                          onClick={() => setOpenId(openId === b.id ? null : b.id)}
                          ariaLabel={`${openId === b.id ? "Fermer" : "Ouvrir"} la boîte ${b.name}`}
                          label={
                            <>
                              <span className={cn("serif block truncate", b.name.length > 11 ? "text-[0.78rem]" : "text-[0.95rem]")}>{b.name}</span>
                              <span className="block truncate text-[0.66rem] text-[var(--ink-soft)]">
                                {b.items.length} article{b.items.length > 1 ? "s" : ""}, {b.hint.toLowerCase()}
                              </span>
                            </>
                          }
                          contents={
                            <span className="flex gap-1">
                              {b.items.slice(0, 3).map((i, k) => (
                                <span
                                  key={i.id}
                                  className="block w-[64px] rounded-md bg-[var(--paper)] px-1.5 py-1 text-center text-[0.62rem] leading-tight shadow-md"
                                  style={{ transform: `rotate(${(k - 1) * 8}deg) translateY(${k === 1 ? -8 : 0}px)` }}
                                >
                                  {i.title.split(" ").slice(0, 2).join(" ")}
                                </span>
                              ))}
                            </span>
                          }
                        />
                      </div>
                    ))}
                  </div>
                  <div className="shelf-plank absolute inset-x-0 bottom-4" />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="lg:sticky lg:top-6 lg:self-start">
          <AnimatePresence mode="wait">
            {openBox ? (
              openBox.items.length ? (
                <BoxPanel key={openBox.id} box={openBox} onPublish={publish} />
              ) : (
                <motion.div
                  key={openBox.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="rounded-[1.6rem] bg-[var(--paper)] p-7"
                >
                  <h2 className="serif text-[1.9rem]">{openBox.name}</h2>
                  <p className="mt-2 text-[var(--ink-soft)]">
                    Cette boîte est vide. Prenez un article en photo depuis l&apos;extension Chrome ou le tableau de bord pour la
                    remplir.
                  </p>
                </motion.div>
              )
            ) : (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="rounded-[1.6rem] border-[1.5px] border-dashed border-[rgba(67,48,46,0.25)] p-7"
              >
                <h2 className="serif text-[1.6rem]">Choisissez une boîte</h2>
                <p className="mt-2 max-w-[26rem] text-[var(--ink-soft)]">
                  Chaque boîte correspond à un coin de chez vous. Cliquez dessus : Poulpe l&apos;ouvre et sort la liste des
                  articles, avec leur statut sur chaque site.
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </section>

      <section className="bg-[var(--ink)] text-[var(--butter)]">
        <div className="mx-auto max-w-[1240px] px-4 py-16 sm:px-8 lg:py-20">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <h2 className="serif max-w-[36rem] text-[clamp(1.8rem,3.6vw,2.6rem)] leading-[1.1]">
              Ce que screenpipe a remarqué cette semaine
            </h2>
            <p className="max-w-[24rem] text-[0.92rem] text-[#C9B9A0]">
              Des gestes que vous répétez à l&apos;écran. Activez une automatisation et Poulpe s&apos;en charge.
            </p>
          </div>
          <ul className="mt-10 grid gap-4 md:grid-cols-3">
            {DEMO_TASKS.map((t) => {
              const on = automated.includes(t.id)
              return (
                <li key={t.id} className="flex flex-col rounded-[1.4rem] bg-[rgba(255,241,181,0.07)] p-6">
                  <p className="serif text-[2rem] leading-none">{t.count.split(" ")[0]}×</p>
                  <p className="mt-1 text-[0.85rem] text-[#C9B9A0]">{t.count.split(" ").slice(1).join(" ")}</p>
                  <p className="mt-4 leading-snug">{t.what}.</p>
                  <p className="mt-3 text-[0.92rem] text-[#E9DDC4]">Proposition : {t.proposal.toLowerCase()}.</p>
                  <button
                    type="button"
                    onClick={() => {
                      setAutomated(on ? automated.filter((x) => x !== t.id) : [...automated, t.id])
                      toast(on ? "Automatisation désactivée" : "Automatisation activée")
                    }}
                    className={cn(
                      "sf-btn mt-6 self-start !py-2 !text-[0.88rem]",
                      on ? "bg-[var(--butter)] text-[var(--ink)]" : "border-[1.5px] border-[var(--butter)]"
                    )}
                    aria-pressed={on}
                  >
                    {on ? (
                      <>
                        <Check className="h-4 w-4" /> Automatisation activée
                      </>
                    ) : (
                      "Activer l'automatisation"
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      </section>
    </div>
  )
}
