"use client"

import { Clock } from "lucide-react"
import Link from "next/link"
import { useWorkspaceResource } from "@/lib/use-workspace-resource"
import { cn } from "@/lib/utils"

type Billing = { plan: string; complimentary: boolean; usage: { desktopSeconds: number }; quota: { desktopMinutes: number }; plans: { id: string; name: string }[] }

/* Header chip: on the trial, how much free desktop time is left and a one-click way to the plans. */
export function PlanChip({ className }: { className?: string }) {
  const { data } = useWorkspaceResource<{ billing: Billing }>("/v1/billing")
  const b = data?.billing
  if (!b || b.complimentary) return null
  const leftMin = Math.max(0, Math.round(b.quota.desktopMinutes - b.usage.desktopSeconds / 60))
  const trial = b.plan === "trial"
  const name = b.plans.find((p) => p.id === b.plan)?.name ?? b.plan
  return (
    <Link
      href="/dashboard/plan"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors hover:bg-muted",
        trial && leftMin <= 5 ? "border-destructive/40 text-destructive" : "text-muted-foreground",
        className
      )}
      title={trial ? "Free trial — pick a plan to keep the desktop" : "Your plan"}
    >
      <Clock className="w-3 h-3" />
      {trial ? <><span className="font-medium text-foreground">Trial</span> · {leftMin} min left · <span className="underline underline-offset-2">Upgrade</span></> : <>{name}</>}
    </Link>
  )
}
