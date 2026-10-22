"use client"

import { Clock, ShieldCheck, Sparkles } from "lucide-react"
import { Card, PageHeader } from "@/components/ui"
import { PlanCard } from "@/components/oh/plan-card"

export default function PlanPage() {
  return (
    <div className="space-y-6">
      <PageHeader label="Account" title="Plan & billing" subtitle="Start free with 30 minutes of remote desktop. Pick a plan when you want the agent to keep working — cancel any time from “Manage billing”." />
      <PlanCard />
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
