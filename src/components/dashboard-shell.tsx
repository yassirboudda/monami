"use client"

import { useClerk, useUser } from "@/lib/auth"
import { BarChart3, Code2, CreditCard, LogOut, MessageSquareText, MonitorSmartphone, Package, Settings, Store, Users, Workflow } from "lucide-react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useMemo, useRef, useSyncExternalStore } from "react"
import { toast } from "sonner"
import { useWorkspaceResource } from "@/lib/use-workspace-resource"
import { Octopus } from "./oh/octopus"
import { MonamiLogo } from "@/components/oh/monami-brand"
import { PriceAlerts } from "@/components/oh/price-alerts"
import { PlanChip } from "@/components/oh/plan-chip"
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
  { href: "/dashboard/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/dashboard/team", label: "Team", icon: Users },
  { href: "/dashboard/developers", label: "API key", icon: Code2 },
  { href: "/dashboard/plan", label: "Plan", icon: CreditCard },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
]

type AgentNotice = { id: string; kind: "info" | "approval" | "sent"; title: string; body: string; status: string; created_at: string }
const SEEN_KEY = "oh.agentSeenAt"
const seenListeners = new Set<() => void>()
const seenStore = {
  subscribe: (cb: () => void) => {
    seenListeners.add(cb)
    return () => seenListeners.delete(cb)
  },
  get: () => localStorage.getItem(SEEN_KEY) ?? "",
  getServer: () => "",
  set: (value: string) => {
    localStorage.setItem(SEEN_KEY, value)
    seenListeners.forEach((cb) => cb())
  },
}

/** Agent activity (replies sent to buyers, approval requests) → badge on "Chat" + toast anywhere in the dashboard. */
function useAgentNotifications(pathname: string) {
  const router = useRouter()
  const feed = useWorkspaceResource<{ messages: AgentNotice[] }>("/v1/agent/messages?limit=20")
  const known = useRef<Set<string> | null>(null)
  const seenAt = useSyncExternalStore(seenStore.subscribe, seenStore.get, seenStore.getServer)
  const onChat = pathname.startsWith("/dashboard/chat")

  useEffect(() => {
    const id = setInterval(() => void feed.mutate(), 20000)
    return () => clearInterval(id)
  }, [feed])

  const messages = useMemo(
    () => (feed.data?.messages ?? []).filter((m) => m.kind === "sent" || (m.kind === "approval" && m.status === "pending")),
    [feed.data],
  )

  useEffect(() => {
    if (!feed.data) return
    if (onChat) seenStore.set(new Date().toISOString())
    const ids = new Set(messages.map((m) => m.id))
    if (known.current) {
      const fresh = messages.filter((m) => !known.current!.has(m.id))
      for (const m of fresh.slice(0, 3)) {
        const show = m.kind === "approval" ? toast.warning : toast.success
        show(m.title, {
          description: m.body.slice(0, 160),
          duration: 10000,
          action: onChat ? undefined : { label: "Open chat", onClick: () => router.push("/dashboard/chat") },
        })
      }
    }
    known.current = ids
  }, [feed.data, messages, onChat, router])

  return onChat ? 0 : messages.filter((m) => m.created_at > seenAt).length
}

function NavLinks() {
  const pathname = usePathname()
  const { setOpenMobile } = useSidebar()
  const unread = useAgentNotifications(pathname)
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
              {n.href === "/dashboard/chat" && unread > 0 && (
                <span className="ml-auto min-w-5 h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-[11px] font-semibold flex items-center justify-center">
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
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
  const name = user?.firstName || email || "Compte MonAmi"

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <Link href="/dashboard/chat" className="flex items-center gap-2 px-2 py-1.5" aria-label="MonAmi">
            <Octopus still className="w-7 shrink-0" label="" />
            <MonamiLogo className="text-[22px] group-data-[collapsible=icon]:hidden" />
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
          <PlanChip className="ml-auto" />
          <PriceAlerts />
          <div className="truncate text-xs text-muted-foreground">{name}</div>
        </header>
        <main className="flex-1 w-full min-w-0 max-w-6xl mx-auto overflow-x-hidden px-4 py-6 lg:px-8">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  )
}
