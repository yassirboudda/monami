"use client"

import { Clock, ShieldCheck, Sparkles } from "lucide-react"
import { Card, PageHeader } from "@/components/ui"
import { PlanCard } from "@/components/oh/plan-card"

export default function PlanPage() {
  return (
    <div className="space-y-6">
      <PageHeader label="Account" title="Plan & billing" subtitle="Start free with 30 minutes of remote desktop. Pick a plan when you want the agent to keep working — cancel any time from “Manage billing”." />
      <PlanCard />
      <Card className="p-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <span className="font-medium">Every remote desktop</span>
        {[["GPU", "NVIDIA A6000 · 48 GB VRAM"], ["CPU", "6 × x86_64"], ["RAM", "48 GB"], ["SSD", "256 GB"]].map(([k, v]) => (
          <span key={k} className="inline-flex items-center gap-1.5 text-muted-foreground"><span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-foreground">{k}</span>{v}</span>
        ))}
        <span className="text-muted-foreground">Browser + terminal, isolated per account.</span>
      </Card>
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { icon: Clock, t: "Remote desktop minutes", d: "Counted only while your desktop session is open. Unlimited = on 24/7, all month." },
          { icon: Sparkles, t: "AI tokens", d: "Every chat answer, reply draft and price analysis uses tokens from your monthly budget." },
          { icon: ShieldCheck, t: "Secure payment", d: "Card handled by Stripe; invoices and cancellation in “Manage billing”. Quotas reset on the 1st." },
        ].map(({ icon: Icon, t, d }) => (
          <Card key={t} className="p-4">
            <Icon className="w-4 h-4 text-muted-foreground" />
            <div className="mt-2 font-medium text-sm">{t}</div>
            <p className="text-xs text-muted-foreground mt-1">{d}</p>
          </Card>
        ))}
      </div>
    </div>
  )
}
