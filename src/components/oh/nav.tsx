"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/components/ui"
import { useT } from "@/lib/oh-i18n"
import { Octopus } from "./octopus"

export function OhNav() {
  const { t, lang, setLang } = useT()
  const path = usePathname()
  const link = (href: string, label: string) => (
    <Link
      href={href}
      className={cn("oh-navlink", path === href && "oh-navlink-on")}
      aria-current={path === href ? "page" : undefined}
    >
      {label}
    </Link>
  )
  return (
    <header className="relative z-30">
      <nav className="mx-auto max-w-6xl px-4 sm:px-6 h-16 sm:h-20 flex items-center gap-3">
        <Link href="/" className="flex items-center gap-2 mr-auto" aria-label="OctoHandy">
          <Octopus still className="w-9 sm:w-10" label="" />
          <span className="oh-serif text-xl sm:text-[22px] text-[var(--ink)]">OctoHandy</span>
        </Link>
        <div className="hidden sm:flex items-center gap-1">
          {link("/explore", t.nav.explore)}
          {link("/profile", t.nav.shelf)}
        </div>
        <div className="oh-lang" role="group" aria-label="Language">
          {(["en", "fr"] as const).map((l) => (
            <button key={l} type="button" onClick={() => setLang(l)} aria-pressed={lang === l} className={cn(lang === l && "on")}>
              {l.toUpperCase()}
            </button>
          ))}
        </div>
        <Link href="/sign-in" className="oh-btn oh-btn-ink hidden sm:inline-flex">
          {t.nav.signIn}
        </Link>
      </nav>
      <div className="sm:hidden flex gap-1 px-4 pb-2">
        {link("/explore", t.nav.explore)}
        {link("/profile", t.nav.shelf)}
      </div>
    </header>
  )
}
