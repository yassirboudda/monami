"use client"

import { Bot, Database, MonitorSmartphone, ShieldCheck } from "lucide-react"
import Link from "next/link"
import { Card, PageHeader } from "@/components/ui"
import { ApiKeyCard } from "@/components/oh/api-key-card"

export default function DevelopersPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        label="API key"
        title="A remote desktop for your own agent"
        subtitle="Claude, Cursor, n8n, OpenClaw or your code: one API key gives any agent a real cloud computer (browser + terminal, isolated per account) plus market prices, your shops and the chat — through MCP."
      />
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { icon: MonitorSmartphone, t: "Your own computer", d: "desktop_session opens your isolated Linux desktop and returns a live noVNC link; desktop_browser navigates, reads, clicks, types; desktop_record films it." },
          { icon: ShieldCheck, t: "Same rules as the app", d: "Your plan's desktop minutes and AI tokens apply; replies and discounts above your limit still wait for your approval." },
          { icon: Database, t: "Stored on Aiven", d: "Events, prices and analytics live on Aiven PostgreSQL / Kafka / Valkey / ClickHouse, kept 90 days." },
        ].map(({ icon: Icon, t, d }) => (
          <Card key={t} className="p-4">
            <Icon className="w-4 h-4 text-muted-foreground" />
            <div className="mt-2 font-medium text-sm">{t}</div>
            <p className="text-xs text-muted-foreground mt-1">{d}</p>
          </Card>
        ))}
      </div>
      <ApiKeyCard />
      <Card className="p-5 space-y-3">
        <div className="flex items-center gap-2"><Bot className="w-4 h-4 text-muted-foreground" /><h2 className="font-medium">Try it in 60 seconds</h2></div>
        <ol className="list-decimal pl-5 text-sm space-y-1.5 text-foreground/90">
          <li>Create a key above and paste the config into Claude Desktop / Cursor (<code className="rounded bg-muted px-1">mcpServers</code>).</li>
          <li>Ask your agent: <em>“open my monami desktop and go to vinted.fr”</em> — it calls <code className="rounded bg-muted px-1">desktop_session</code> then <code className="rounded bg-muted px-1">desktop_browser</code>.</li>
          <li>Watch it live on the <Link href="/dashboard/desktop" className="underline underline-offset-2">Desktop</Link> page; minutes count against your <Link href="/dashboard/plan" className="underline underline-offset-2">plan</Link>.</li>
        </ol>
      </Card>
    </div>
  )
}
