"use client"

import type { ReactNode } from "react"
import { cn } from "@/components/ui"
import { LangProvider } from "@/lib/oh-i18n"
import { OhNav } from "./nav"

export function OhShell({ children, bg = "sky", className }: { children: ReactNode; bg?: "sky" | "butter" | "paper"; className?: string }) {
  return (
    <LangProvider>
      <div className={cn("oh min-h-dvh", `oh-bg-${bg}`, className)}>
        <div className="oh-grain" aria-hidden />
        <OhNav />
        {children}
      </div>
    </LangProvider>
  )
}
