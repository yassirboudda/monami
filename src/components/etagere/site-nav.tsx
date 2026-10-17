"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/components/ui"

const LINKS = [
  { href: "/chercher", label: "Chercher" },
  { href: "/inventaire", label: "Mon inventaire" },
  { href: "/sign-in", label: "Se connecter" },
]

export function SiteNav({ tone = "sky" }: { tone?: "sky" | "butter" | "paper" }) {
  const path = usePathname()
  return (
    <header
      className={cn(
        "relative z-30 w-full",
        tone === "sky" && "bg-[var(--sky)]",
        tone === "butter" && "bg-[var(--butter-soft)]",
        tone === "paper" && "bg-[var(--paper)]"
      )}
    >
      <nav className="mx-auto flex max-w-[1240px] items-center justify-between gap-4 px-4 py-5 sm:px-8">
        <Link href="/" className="serif text-[1.35rem] leading-none">
          Stockflow
        </Link>
        <p className="hidden text-[0.95rem] text-[var(--ink-soft)] md:block">Toutes les boutiques, une seule étagère</p>
        <ul className="flex items-center gap-4 text-[0.95rem] sm:gap-7">
          {LINKS.map((l) => (
            <li key={l.href} className={cn(l.href === "/sign-in" && "hidden sm:block")}>
              <Link
                href={l.href}
                className={cn(
                  "underline-offset-4 decoration-[1.5px] hover:underline",
                  path === l.href && "underline"
                )}
              >
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  )
}
