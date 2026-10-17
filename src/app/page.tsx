"use client"

import gsap from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"
import { ArrowRight } from "lucide-react"
import Link from "next/link"
import { useLayoutEffect, useRef } from "react"
import { BoxImg } from "@/components/oh/box"
import { Octopus } from "@/components/oh/octopus"
import { OhShell } from "@/components/oh/shell"
import { useT } from "@/lib/oh-i18n"
import { FAMILIES } from "@/lib/oh-data"

gsap.registerPlugin(ScrollTrigger)

// Scattered pile around the octopus: [box, left %, bottom %, width %, rotation, z, scroll speed]
const PILE: [string, number, number, number, number, number, number][] = [
  ["mk-farfetch", 5, 36, 12, -9, 1, 1.4],
  ["mk-leboncoin", 15, 17, 15, 6, 2, 0.9],
  ["mk-vinted", 1, 0, 20, -3, 4, 0.5],
  ["mk-vestiaire", 22, -3, 19, 3, 5, 0.3],
  ["mk-zara", 68, 38, 12, 8, 1, 1.5],
  ["mk-zalando", 79, 19, 17, -6, 2, 1.0],
  ["mk-amazon", 62, 1, 15, -4, 5, 0.4],
  ["mk-ebay", 78, -2, 18, 4, 4, 0.6],
  ["mk-depop", 88, 46, 10, 12, 1, 1.7],
]

export default function Home() {
  return (
    <OhShell bg="sky">
      <HomeContent />
    </OhShell>
  )
}

function HomeContent() {
  const { t, lang } = useT()
  const stage = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!stage.current || matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const ctx = gsap.context(() => {
      const boxes = gsap.utils.toArray<HTMLElement>(".oh-pile-box")
      gsap.from(boxes, { y: -140, opacity: 0, rotation: () => gsap.utils.random(-25, 25), duration: 1.1, ease: "bounce.out", stagger: 0.07, delay: 0.15 })
      gsap.from(".oh-hero-octo", { y: 40, opacity: 0, duration: 1, ease: "power3.out" })
      boxes.forEach((el) => {
        gsap.to(el, { yPercent: -60 * Number(el.dataset.speed || 1), ease: "none", scrollTrigger: { trigger: stage.current, start: "top 35%", end: "bottom top", scrub: true } })
      })
      gsap.utils.toArray<HTMLElement>(".oh-reveal").forEach((el) => {
        gsap.from(el, { y: 36, opacity: 0, duration: 0.9, ease: "power3.out", scrollTrigger: { trigger: el, start: "top 85%" } })
      })
    }, stage.current.parentElement ?? undefined)
    return () => ctx.revert()
  }, [])

  return (
    <main>
      {/* Hero */}
      <section className="relative overflow-hidden pb-14 sm:pb-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 pt-6 sm:pt-10 text-center">
          <p className="oh-kicker">{t.home.kicker}</p>
          <h1 className="oh-serif oh-display mt-4">
            {t.home.title1}
            <br />
            <em className="not-italic text-[var(--ink-soft)]">{t.home.title2}</em>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-[17px] sm:text-lg leading-relaxed text-[var(--ink-soft)]">{t.home.lead}</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/explore" className="oh-btn oh-btn-ink oh-btn-lg">
              {t.home.ctaExplore} <ArrowRight size={18} />
            </Link>
            <Link href="/profile" className="oh-btn oh-btn-line oh-btn-lg">
              {t.home.ctaShelf}
            </Link>
          </div>
        </div>

        <div ref={stage} className="relative mx-auto mt-6 sm:mt-0 w-full max-w-[1100px] aspect-[11/6.4] sm:aspect-[11/5.2]">
          <div className="oh-hero-octo absolute left-1/2 -translate-x-1/2 bottom-[8%] w-[46%] sm:w-[38%] z-[3]">
            <Octopus label="OctoHandy" className="w-full" />
          </div>
          {PILE.map(([name, left, bottom, width, rot, z, speed]) => (
            <div
              key={name}
              className="oh-pile-box absolute"
              data-speed={speed}
              style={{ left: `${left}%`, bottom: `${bottom}%`, width: `${width}%`, zIndex: z, rotate: `${rot}deg` }}
            >
              <BoxImg name={name} width={320} className="w-full h-auto" preload={z >= 4} alt="" />
            </div>
          ))}
          <div className="absolute inset-x-[6%] bottom-[-2%] h-[10%] rounded-[50%] bg-[var(--ink)] opacity-[0.07] blur-xl" aria-hidden />
        </div>
      </section>

      {/* How it works */}
      <section className="oh-bg-paper relative">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-20 sm:py-28">
          <h2 className="oh-serif oh-h2 text-center oh-reveal">{t.home.howTitle}</h2>
          <ol className="mt-12 sm:mt-16 grid gap-6 sm:grid-cols-3">
            {t.home.how.map((s, i) => (
              <li key={s.t} className="oh-card p-6 sm:p-7 oh-reveal">
                <div className="flex items-center justify-between">
                  <span className="oh-step">{i + 1}</span>
                  <BoxImg name={["mk-vinted", "mk-ebay-open", "mk-vestiaire"][i]} width={120} className="w-24 h-auto -my-3" alt="" />
                </div>
                <h3 className="oh-serif text-2xl mt-5">{s.t}</h3>
                <p className="mt-2 text-[var(--ink-soft)] leading-relaxed">{s.d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Ask */}
      <section className="oh-bg-butter relative overflow-hidden">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-20 sm:py-28 grid gap-12 lg:grid-cols-[1fr_1.1fr] items-center">
          <div className="oh-reveal">
            <h2 className="oh-serif oh-h2">{t.home.askTitle}</h2>
            <p className="mt-4 text-lg text-[var(--ink-soft)] max-w-md leading-relaxed">{t.home.askLead}</p>
            <Octopus className="w-40 sm:w-52 mt-8" label="" />
          </div>
          <div className="oh-card p-5 sm:p-7 space-y-3 oh-reveal">
            <p className="oh-bubble oh-bubble-me ml-auto">{t.home.askUser}</p>
            <p className="oh-bubble oh-bubble-bot">{t.home.askBot}</p>
            <p className="oh-bubble oh-bubble-me ml-auto">{t.home.askUser2}</p>
            <p className="oh-bubble oh-bubble-bot">{t.home.askBot2}</p>
          </div>
        </div>
      </section>

      {/* Seller shelf */}
      <section className="oh-bg-ink relative overflow-hidden">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-20 sm:py-28">
          <div className="max-w-xl oh-reveal">
            <h2 className="oh-serif oh-h2 text-[var(--butter)]">{t.home.sellTitle}</h2>
            <p className="mt-4 text-lg text-[var(--butter)]/75 leading-relaxed">{t.home.sellLead}</p>
            <Link href="/profile" className="oh-btn oh-btn-butter oh-btn-lg mt-8">
              {t.home.ctaShelf} <ArrowRight size={18} />
            </Link>
          </div>
          <div className="mt-14 oh-reveal">
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-x-4 gap-y-2 items-end">
              {FAMILIES.map((f) => (
                <BoxImg key={f} name={`fam-${f}-${lang}`} width={220} className="w-full h-auto" alt={t.families[f]} />
              ))}
            </div>
            <div className="oh-plank" aria-hidden />
          </div>
        </div>
      </section>

      <footer className="oh-bg-paper">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-10 flex flex-wrap items-center gap-3 justify-between text-sm text-[var(--ink-soft)]">
          <span className="flex items-center gap-2">
            <Octopus still className="w-7" label="" />
            <span className="oh-serif text-base text-[var(--ink)]">OctoHandy</span>
          </span>
          <span>{t.home.footer}</span>
        </div>
      </footer>
    </main>
  )
}
