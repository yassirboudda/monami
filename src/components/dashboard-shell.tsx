"use client"

import { useClerk, useUser } from "@/lib/auth"
import { LogOut, MessageSquareText, MonitorSmartphone, Package, Settings, Store, Users, Workflow } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Octopus } from "./oh/octopus"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "./ui/sidebar"

const nav = [
  { href: "/dashboard/chat", label: "Chat", icon: MessageSquareText },
  { href: "/dashboard/shops", label: "Shops", icon: Store },
  { href: "/dashboard/stock", label: "Stock", icon: Package },
  { href: "/dashboard/desktop", label: "Desktop", icon: MonitorSmartphone },
  { href: "/dashboard/workflows", label: "Workflows", icon: Workflow },
  { href: "/dashboard/team", label: "Team", icon: Users },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
]

function NavLinks() {
  const pathname = usePathname()
  const { setOpenMobile } = useSidebar()
  const active = (href: string) => (href === "/dashboard" ? pathname === href : pathname.startsWith(href))
  return (
    <SidebarMenu>
      {nav.map((n) => (
        <SidebarMenuItem key={n.href}>
          <SidebarMenuButton
            asChild
            isActive={active(n.href)}
            tooltip={n.label}
            className="data-[active=true]:bg-butter data-[active=true]:font-semibold"
          >
            <Link href={n.href} onClick={() => setOpenMobile(false)}>
              <n.icon />
              <span>{n.label}</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  )
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const { user } = useUser()
  const { signOut } = useClerk()
  const email = user?.primaryEmailAddress?.emailAddress
  const name = user?.firstName || email || "Compte OctoHandy"

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <Link href="/dashboard/chat" className="flex items-center gap-2 px-2 py-1.5" aria-label="OctoHandy">
            <Octopus still className="w-7 shrink-0" label="" />
            <span className="font-heading text-lg group-data-[collapsible=icon]:hidden">OctoHandy</span>
          </Link>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <NavLinks />
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={() => signOut({ redirectUrl: "/" })} tooltip="Sign out" className="text-muted-foreground">
                <LogOut />
                <span className="min-w-0 truncate">
                  <span className="block truncate">{name}</span>
                  {email && <span className="block truncate text-[11px] opacity-70">Sign out</span>}
                </span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/90 px-4 backdrop-blur">
          <SidebarTrigger className="-ml-1" />
          <div className="ml-auto truncate text-xs text-muted-foreground">{name}</div>
        </header>
        <main className="flex-1 w-full max-w-6xl mx-auto px-4 py-6 lg:px-8">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  )
}
