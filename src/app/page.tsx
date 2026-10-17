"use client"

import { motion } from "framer-motion"
import Link from "next/link"
import { useState } from "react"
import { Crate } from "@/components/etagere/crate"
import { Octopus } from "@/components/etagere/octopus"
import { SiteNav } from "@/components/etagere/site-nav"
import { DEMO_MEMORIES, MARKETPLACES } from "@/lib/demo-data"

// Pile de cartons : bas (3), milieu (3), haut (2). x/y en px depuis le bas-gauche de la pile.
const STACK = [
  { x: 0, y: 0, r: -1 },
  { x: 165, y: 0, r: 0.5 },
  { x: 330, y: 0, r: 1 },
  { x: 25, y: 122, r: 2.2 },
  { x: 188, y: 120, r: -1.5 },
  { x: 345, y: 124, r: 3 },
  { x: 92, y: 242, r: -3 },
  { x: 262, y: 246, r: 4 },
]

function HeroStack() {
  const [open, setOpen] = useState<string | null>(null)
  return (
    <div className="relative h-[480px] w-[500px]">
      <div className="absolute left-[150px] bottom-[300px] z-0">
        <Octopus size={200} />
      </div>
      {MARKETPLACES.map((m, i) => {
        const p = STACK[i]
        return (
          <motion.div
            key={m.id}
            className="absolute"
            style={{ left: p.x, bottom: p.y, zIndex: 10 + (STACK.length - i) }}
            initial={{ y: -420, opacity: 0, rotate: p.r * 4 }}
            animate={{ y: 0, opacity: 1, rotate: p.r }}
            transition={{ delay: 0.25 + i * 0.11, type: "spring", stiffness: 260, damping: 18 }}
          >
            <Crate
              width={150}
              height={110}
              depth={100}
              wobble={i > 2 ? (i % 2 ? 1.4 : -1.2) : undefined}
              open={open === m.id}
              onClick={() => setOpen(open === m.id ? null : m.id)}
              ariaLabel={`Ouvrir la boîte ${m.name}`}
              label={
                <>
                  <span className={`serif block truncate ${m.name.length > 11 ? "text-[0.76rem]" : "text-[0.95rem]"}`}>{m.name}</span>
                  <span className="block truncate text-[0.68rem] text-[var(--ink-soft)]">{m.kind}</span>
                </>
              }
              contents={
                <span className="block w-[190px] rounded-2xl bg-[var(--paper)] px-4 py-3 text-[0.82rem] leading-snug shadow-[0_18px_40px_-18px_rgba(67,48,46,0.6)]">
                  Poulpe fouille <b>{m.name}</b> pour vous à chaque recherche.
                </span>
              }
            />
          </motion.div>
        )
      })}
    </div>
  )
}

export default function HomePage() {
  return (
    <div className="sf bg-[var(--paper)]">
      <SiteNav tone="sky" />

      <section className="relative overflow-hidden bg-[var(--sky)]">
        <div className="grain" />
        <div className="relative mx-auto grid max-w-[1240px] items-end gap-6 px-4 pb-16 pt-6 sm:px-8 lg:grid-cols-[1fr_auto] lg:pb-24 lg:pt-10">
          <div className="max-w-[34rem] pb-2 lg:pb-10">
            <h1 className="serif text-[clamp(2.6rem,6.2vw,5rem)] leading-[1.02]">Huit bras pour porter toutes vos boîtes.</h1>
            <p className="mt-6 max-w-[30rem] text-[1.08rem] leading-relaxed text-[var(--ink-soft)]">
              Vous cherchez des escarpins vus sur Instagram ? Poulpe les cherche sur Vinted, Vestiaire Collective, Zalando et
              cinq autres sites en même temps. Vous vendez ? Il range votre stock sur une seule étagère.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/chercher" className="sf-btn sf-btn-ink">
                Chercher un article
              </Link>
              <Link href="/inventaire" className="sf-btn sf-btn-line">
                Ranger mon stock
              </Link>
            </div>
            <p className="mt-8 text-[0.9rem] text-[var(--ink-soft)]">Cliquez sur une boîte pour l&apos;ouvrir.</p>
          </div>
          <div className="flex min-w-0 justify-center overflow-hidden pt-4 lg:overflow-visible lg:pt-0">
            <div className="h-[300px] shrink-0 sm:h-[384px] lg:h-auto">
              <div className="origin-top scale-[0.62] sm:scale-[0.8] lg:scale-100">
                <HeroStack />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-[var(--paper)]">
        <div className="mx-auto max-w-[1240px] px-4 py-20 sm:px-8 lg:py-28">
          <h2 className="serif max-w-[40rem] text-[clamp(2rem,4vw,3rem)] leading-[1.08]">Deux étagères dans la même maison.</h2>
          <div className="mt-12 grid gap-6 md:grid-cols-2">
            <Link
              href="/chercher"
              className="group relative overflow-hidden rounded-[2rem] bg-[var(--sky-soft)] p-8 transition-transform duration-300 hover:-translate-y-1 sm:p-10"
            >
              <p className="text-[0.95rem] text-[var(--ink-soft)]">Pour acheter</p>
              <h3 className="serif mt-2 text-[2rem] leading-tight">Je cherche un article</h3>
              <p className="mt-4 max-w-[26rem] leading-relaxed text-[var(--ink-soft)]">
                Tapez un modèle ou déposez une photo, choisissez matière, couleur et budget. Poulpe ouvre les boîtes des huit
                sites et vous ramène tout : neuf, occasion, ou avec un petit défaut à prix cassé.
              </p>
              <span className="mt-8 inline-block font-semibold underline decoration-[1.5px] underline-offset-4">Ouvrir la recherche</span>
              <div className="pointer-events-none absolute -bottom-6 -right-4 hidden sm:block">
                <Crate width={120} height={90} depth={90} open label={<span className="serif text-sm">Vinted</span>} showShadow={false} />
              </div>
            </Link>
            <Link
              href="/inventaire"
              className="group relative overflow-hidden rounded-[2rem] bg-[var(--butter-soft)] p-8 transition-transform duration-300 hover:-translate-y-1 sm:p-10"
            >
              <p className="text-[0.95rem] text-[var(--ink-soft)]">Pour vendre</p>
              <h3 className="serif mt-2 text-[2rem] leading-tight">Je range mon stock</h3>
              <p className="mt-4 max-w-[26rem] leading-relaxed text-[var(--ink-soft)]">
                Chaque boîte de votre étagère est un coin de chez vous : chaussures, vestes, déco. Ouvrez-la pour voir ce qui
                est en ligne, réservé, vendu ou encore à publier.
              </p>
              <span className="mt-8 inline-block font-semibold underline decoration-[1.5px] underline-offset-4">Voir mon inventaire</span>
              <div className="pointer-events-none absolute -bottom-6 -right-4 hidden sm:block">
                <Crate width={120} height={90} depth={90} label={<span className="serif text-sm">Vestes</span>} showShadow={false} />
              </div>
            </Link>
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden bg-[var(--ink)] text-[var(--butter)]">
        <div className="mx-auto grid max-w-[1240px] gap-14 px-4 py-20 sm:px-8 lg:grid-cols-[1fr_1.1fr] lg:py-28">
          <div>
            <h2 className="serif text-[clamp(2rem,4vw,3rem)] leading-[1.08]">Il se souvient de ce que vous avez vu.</h2>
            <p className="mt-6 max-w-[30rem] leading-relaxed text-[#E9DDC4]">
              Stockflow se branche sur screenpipe, qui garde en mémoire, sur votre ordinateur, ce qui passe à l&apos;écran. Les
              escarpins aperçus hier soir dans une story deviennent une recherche en un clic. Les gestes que vous répétez en
              tant que vendeur deviennent une automatisation.
            </p>
            <p className="mt-4 max-w-[30rem] text-[0.92rem] leading-relaxed text-[#C9B9A0]">
              Rien ne part sur nos serveurs : la page lit screenpipe directement sur votre machine.
            </p>
          </div>
          <ol className="relative space-y-4 border-l border-[rgba(255,241,181,0.25)] pl-6">
            {DEMO_MEMORIES.slice(0, 3).map((m) => (
              <li key={m.id} className="relative">
                <span className="absolute -left-[31px] top-5 h-2.5 w-2.5 rounded-full bg-[var(--butter)]" />
                <Link
                  href={`/chercher?q=${encodeURIComponent(m.query)}`}
                  className="block rounded-2xl bg-[rgba(255,241,181,0.07)] p-5 transition-colors hover:bg-[rgba(255,241,181,0.13)]"
                >
                  <p className="text-[0.85rem] text-[#C9B9A0]">
                    Vu sur {m.seenOn}, {m.when}
                  </p>
                  <p className="serif mt-1 text-[1.3rem]">{m.query}</p>
                  <p className="mt-1 text-[0.92rem] text-[#E9DDC4]">{m.excerpt}</p>
                  <p className="mt-3 text-[0.9rem] font-semibold underline decoration-[1.5px] underline-offset-4">Chercher partout</p>
                </Link>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <footer className="bg-[var(--paper)]">
        <div className="mx-auto flex max-w-[1240px] flex-col items-start justify-between gap-4 px-4 py-10 text-[0.92rem] text-[var(--ink-soft)] sm:flex-row sm:items-center sm:px-8">
          <p>
            <span className="serif text-[var(--ink)]">Stockflow</span>, fait à 42 Paris pendant le hackathon screenpipe.
          </p>
          <Link href="/dashboard" className="underline underline-offset-4">
            Tableau de bord vendeur
          </Link>
        </div>
      </footer>
    </div>
  )
}
