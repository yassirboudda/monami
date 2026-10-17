"use client"

import { OrganizationSwitcher, useClerk, useUser } from "@clerk/nextjs"
import { LogOut, Menu, MessageSquareText, MonitorSmartphone, Package, Store, Users, Workflow, X } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"
import { Octopus } from "./oh/octopus"
import { cn } from "./ui"

const nav = [
  { href: "/dashboard/chat", label: "Chat", icon: MessageSquareText },
  { href: "/dashboard/shops", label: "Boutique", icon: Store },
  { href: "/dashboard/stock", label: "Stock", icon: Package },
  { href: "/dashboard/desktop", label: "Bureau", icon: MonitorSmartphone },
  { href: "/dashboard/workflows", label: "Workflows", icon: Workflow },
  { href: "/dashboard/team", label: "Équipe", icon: Users },
]

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname()
  const active = (href: string) => pathname.startsWith(href)
  return (
    <nav className="flex flex-col gap-1">
      {nav.map((n) => (
        <Link
          key={n.href}
          href={n.href}
          onClick={onNavigate}
          className={cn(
            "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
            active(n.href) ? "bg-butter font-semibold text-foreground" : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
          )}
        >
          <n.icon className="w-4 h-4 shrink-0" />
          <span>{n.label}</span>
        </Link>
      ))}
    </nav>
  )
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const { user } = useUser()
  const { signOut } = useClerk()
  const [drawer, setDrawer] = useState(false)
  const email = user?.primaryEmailAddress?.emailAddress

  const sidebarInner = (onNavigate?: () => void) => (
    <div className="flex h-full flex-col">
      <Link href="/dashboard/chat" className="flex items-center gap-2 px-3 py-4" aria-label="OctoHandy" onClick={onNavigate}>
        <Octopus still className="w-7 shrink-0" label="" />
        <span className="font-heading text-lg">OctoHandy</span>
      </Link>
      <div className="px-2 flex-1">
        <NavLinks onNavigate={onNavigate} />
      </div>
      <div className="p-2 border-t border-sidebar-border">
        <button
          onClick={() => signOut({ redirectUrl: "/" })}
          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
          title="Déconnexion"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          <span className="truncate">{email ?? "Déconnexion"}</span>
        </button>
      </div>
    </div>
  )

  return (
    <div className="min-h-dvh flex bg-background">
      <aside className="hidden lg:flex w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar sticky top-0 h-dvh">{sidebarInner()}</aside>

      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-foreground/30" onClick={() => setDrawer(false)} />
          <aside className="absolute left-0 top-0 h-full w-72 bg-sidebar border-r border-sidebar-border shadow-xl">
            <button className="absolute right-2 top-3 w-9 h-9 rounded-lg hover:bg-sidebar-accent flex items-center justify-center" onClick={() => setDrawer(false)} aria-label="Fermer">
              <X className="w-5 h-5" />
            </button>
            {sidebarInner(() => setDrawer(false))}
          </aside>
        </div>
      )}

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-background/90 px-4 backdrop-blur">
          <button className="lg:hidden w-9 h-9 -ml-1 rounded-lg hover:bg-accent flex items-center justify-center" onClick={() => setDrawer(true)} aria-label="Menu">
            <Menu className="w-5 h-5" />
          </button>
          <Link href="/dashboard/chat" className="lg:hidden font-heading text-lg">OctoHandy</Link>
          <div className="ml-auto">
            <OrganizationSwitcher
              hidePersonal={false}
              afterCreateOrganizationUrl="/dashboard"
              afterSelectOrganizationUrl="/dashboard"
              afterSelectPersonalUrl="/dashboard"
            />
          </div>
        </header>
        <main className="flex-1 w-full max-w-6xl mx-auto px-4 py-6 lg:px-8">{children}</main>
      </div>
    </div>
  )
}
