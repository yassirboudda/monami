"use client"

import { motion, type Variants } from "framer-motion"
import gsap from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"
import { ArrowRight } from "lucide-react"
import Link from "next/link"
import { useLayoutEffect, useRef } from "react"
import { BoxImg } from "@/components/oh/box"
import { Octopus } from "@/components/oh/octopus"
import { TreeBackground } from "@/components/oh/tree/tree-background"
import { MonamiLogo } from "@/components/oh/monami-brand"
import { OhShell } from "@/components/oh/shell"
import { Button } from "@/components/ui/button"
import { useT } from "@/lib/oh-i18n"

gsap.registerPlugin(ScrollTrigger)

const EASE = [0.16, 1, 0.3, 1] as const
// Hero copy rises in line by line; gsap keeps the box pile and scroll reveals.
const hero: Variants = { show: { transition: { staggerChildren: 0.09, delayChildren: 0.05 } } }
const rise: Variants = { hidden: { opacity: 0, y: 18 }, show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: EASE } } }
const lift = { whileHover: { y: -2 }, whileTap: { scale: 0.97 }, transition: { type: "spring", stiffness: 400, damping: 22 } } as const
// Scattered pile around the octopus: [box, left %, bottom %, width %, rotation, z, scroll speed]
const PILE: [string, number, number, number, number, number, number][] = [
  ["mk-farfetch", 5, 36, 12, -9, 1, 1.4],
  ["mk-vinted-open", 15, 17, 15, 6, 2, 0.9],
  ["mk-vinted", 1, 0, 20, -3, 4, 0.5],
  ["mk-ebay-open", 22, -3, 19, 3, 5, 0.3],
  ["mk-zara", 68, 38, 12, 8, 1, 1.5],
  ["mk-zalando", 79, 19, 17, -6, 2, 1.0],
  ["mk-amazon", 62, 1, 15, -4, 5, 0.4],
  ["mk-ebay", 78, -2, 18, 4, 4, 0.6],
]

export default function Home() {
  return (
    <OhShell>
      <HomeContent />
    </OhShell>
  )
}

function HomeContent() {
  const { t } = useT()
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
    }, stage.current.parentElement ?? undefined)
    return () => ctx.revert()
  }, [])

  return (
    <main className="relative">
      <TreeBackground />
      <div className="relative z-10">
      {/* Hero */}
      <section className="relative overflow-hidden pb-14 sm:pb-20">
        <motion.div className="mx-auto max-w-6xl px-4 sm:px-6 pt-6 sm:pt-10 text-center" variants={hero} initial="hidden" animate="show">
          <motion.p variants={rise} className="oh-kicker">{t.home.kicker}</motion.p>
          <h1 className="oh-serif oh-display mt-4">
            <motion.span variants={rise} className="block">{t.home.title1}</motion.span>
            <motion.em variants={rise} className="block not-italic text-[var(--ink-soft)]">{t.home.title2}</motion.em>
          </h1>
          <motion.p variants={rise} className="mx-auto mt-5 max-w-xl text-[17px] sm:text-lg leading-relaxed text-[var(--ink-soft)]">{t.home.lead}</motion.p>
          <motion.div variants={rise} className="mt-8 flex flex-wrap justify-center gap-3">
            <motion.div {...lift}>
              <Button asChild size="lg">
                <Link href="/sign-up">
                  {t.home.ctaExplore} <ArrowRight />
                </Link>
              </Button>
            </motion.div>
            <motion.div {...lift}>
              <Button asChild size="lg" variant="outline">
                <Link href="/sign-in">{t.home.ctaShelf}</Link>
              </Button>
            </motion.div>
          </motion.div>
        </motion.div>

        {/* sky only as the backdrop behind the octopus art */}
        <div className="mx-auto mt-10 max-w-6xl px-4 sm:px-6">
        <div className="oh-bg-sky rounded-xl border overflow-hidden">
        <div ref={stage} className="relative mx-auto w-full max-w-[1100px] aspect-[11/6.4] sm:aspect-[11/5.2]">
          <div className="oh-hero-octo absolute left-1/2 -translate-x-1/2 bottom-[8%] w-[46%] sm:w-[38%] z-[3]">
            <Octopus label="MonAmi" className="w-full" />
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
        </div>
        </div>
      </section>

      {/* Chapters: transparent text pinned to the climb of the ink tree (nos-brainer style) — nothing opaque over the scene */}
      <section className="relative">
        {[...t.home.how.map((st, i) => ({ k: `how-${i}`, n: String(i + 1).padStart(2, "0"), title: st.t, lead: st.d })),
          { k: "ask", n: "04", title: t.home.askTitle, lead: t.home.askLead }].map((c, i) => (
          <div key={c.k} className="relative min-h-[92vh] flex items-center">
            <motion.div
              className={`mx-auto w-full max-w-6xl px-4 sm:px-6 flex ${i % 2 ? "justify-end" : "justify-start"}`}
              initial={{ opacity: 0, y: 48 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ amount: 0.5, margin: "-10% 0px -10% 0px" }}
              transition={{ duration: 0.8, ease: EASE }}
            >
              <div className={`max-w-md ${i % 2 ? "text-right" : "text-left"}`}>
                <span className="oh-kicker">{c.n}</span>
                <h2 className="oh-serif oh-h2 mt-3">{c.title}</h2>
                <p className="mt-4 text-lg leading-relaxed text-[var(--ink-soft)]">{c.lead}</p>
                {c.k === "ask" && (
                  <div className="mt-6 space-y-2">
                    {[t.home.askUser, t.home.askBot].map((text, j) => (
                      <motion.p
                        key={j}
                        className={j % 2 ? "oh-bubble oh-bubble-bot" : "oh-bubble oh-bubble-me ml-auto"}
                        initial={{ opacity: 0, y: 12 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true, margin: "-80px" }}
                        transition={{ duration: 0.45, delay: 0.3 + j * 0.5, ease: EASE }}
                      >
                        {text}
                      </motion.p>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        ))}
      </section>

      {/* Seller shelf */}

      <footer className="border-t">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-10 flex flex-wrap items-center gap-3 justify-between text-sm text-[var(--ink-soft)]">
          <span className="flex items-center gap-2">
            <Octopus still className="w-7" label="" />
            <MonamiLogo className="text-[20px]" />
          </span>
          <span>{t.home.footer}</span>
        </div>
      </footer>
      </div>
    </main>
  )
}
