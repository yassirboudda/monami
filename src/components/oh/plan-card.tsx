"use client"

import { Check, Clock, CreditCard, Sparkles } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Badge, Button, Card } from "@/components/ui"
import { Progress } from "@/components/ui/progress"
import { useWorkspaceResource } from "@/lib/use-workspace-resource"
import { cn } from "@/lib/utils"

type PlanId = "trial" | "starter" | "pro" | "unlimited"
type Plan = { id: PlanId; name: string; priceLabel: string; features: string[]; desktopMinutes: number; aiTokens: number; available: boolean }
type Billing = {
  configured: boolean
  plan: PlanId
  complimentary: boolean
  status: string
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
  hasCustomer: boolean
  usage: { period: string; desktopSeconds: number; aiTokens: number }
  quota: { desktopMinutes: number; aiTokens: number }
  plans: Plan[]
}

const fmtTokens = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(n % 1_000_000 ? 1 : 0)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n))
const fmtMinutes = (m: number) => (m >= 1440 ? `${Math.round(m / 60)} h` : m >= 60 ? `${(m / 60).toFixed(m % 60 ? 1 : 0)} h` : `${m} min`)

function Gauge({ icon: Icon, label, used, total, unit }: { icon: typeof Clock; label: string; used: number; total: number; unit: (n: number) => string }) {
  const pct = total ? Math.min(100, Math.round((used / total) * 100)) : 0
  return (
    <div className="rounded-xl bg-muted p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="w-3.5 h-3.5" /> {label}
      </div>
      <div className="mt-1 flex items-baseline justify-between gap-2">
        <span className="font-semibold tabular-nums">{unit(used)}</span>
        <span className="text-xs text-muted-foreground tabular-nums">of {unit(total)} this month</span>
      </div>
      <Progress value={pct} className={cn("mt-2 h-1.5", pct >= 90 && "[&>div]:bg-destructive")} aria-label={`${label}: ${pct}% used`} />
    </div>
  )
}

export function PlanCard() {
  const { data, isLoading, mutate, request } = useWorkspaceResource<{ billing: Billing }>("/v1/billing")
  const [busy, setBusy] = useState<string | null>(null)
  const billing = data?.billing

  useEffect(() => {
    const flag = new URLSearchParams(window.location.search).get("billing")
    if (flag === "success") toast.success("Welcome aboard — your subscription is active.")
    if (flag === "cancel") toast("Checkout cancelled, your plan did not change.")
    if (flag) void mutate()
  }, [mutate])

  async function go(kind: "checkout" | "portal", plan?: PlanId) {
    setBusy(plan ?? kind)
    try {
      const { url } = await request<{ url: string }>(`/v1/billing/${kind}${plan ? `?plan=${plan}` : ""}`, { method: "POST" })
      window.location.assign(url)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Billing is unavailable right now.")
      setBusy(null)
    }
  }

  const renews = billing?.currentPeriodEnd
    ? new Date(billing.currentPeriodEnd).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    : null
  const current = billing?.plans.find((p) => p.id === billing.plan)

  return (
    <Card className="p-5 space-y-5">
      <div className="flex items-start gap-3">
        <CreditCard className="w-5 h-5 mt-0.5 text-muted-foreground" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="font-medium">Plan</h2>
            {billing && <Badge tone={billing.plan === "trial" ? "slate" : "amber"}>{current?.name ?? billing.plan}</Badge>}
          </div>
          <p className="text-caption mt-1">
            {isLoading || !billing
              ? "Loading your plan…"
              : billing.complimentary
                ? "Unlimited access included with your account — you can still subscribe below to try the card payment."
                : billing.plan === "trial"
                  ? "Try the remote desktop for 30 minutes, then pick a plan to keep going."
                  : billing.cancelAtPeriodEnd
                    ? `${current?.name} until ${renews} — your plan then goes back to Trial.`
                    : renews
                      ? `${current?.name}, renews on ${renews}.`
                      : `${current?.name} subscription active.`}
          </p>
        </div>
      </div>

      {billing && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Gauge icon={Clock} label="Remote desktop" used={Math.round(billing.usage.desktopSeconds / 60)} total={billing.quota.desktopMinutes} unit={fmtMinutes} />
          <Gauge icon={Sparkles} label="AI tokens" used={billing.usage.aiTokens} total={billing.quota.aiTokens} unit={fmtTokens} />
        </div>
      )}

      {billing && (
        <div className="grid gap-3 md:grid-cols-3">
          {billing.plans.filter((p) => p.id !== "trial").map((p) => {
            const isCurrent = p.id === billing.plan
            return (
              <div key={p.id} className={cn("flex flex-col gap-3 rounded-2xl border p-4", isCurrent ? "border-primary bg-primary/5" : p.id === "pro" && "border-[var(--horizon)]")}>
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{p.name}</span>
                    {p.id === "pro" && !isCurrent && <span className="rounded-full bg-[var(--horizon)]/25 px-2 py-0.5 text-[10px] font-semibold text-[#2f4f7a]">Popular</span>}
                  </div>
                  <div className="mt-1 text-2xl font-semibold tracking-tight text-primary">{p.priceLabel.split(" / ")[0]}<span className="text-sm font-normal text-muted-foreground"> / month</span></div>
                  <div className="text-xs text-muted-foreground">{fmtMinutes(p.desktopMinutes)} of remote desktop · {fmtTokens(p.aiTokens)} AI tokens</div>
                </div>
                <ul className="space-y-1.5 text-sm">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-foreground/90">
                      <Check className="w-3.5 h-3.5 mt-1 shrink-0 text-primary" /> {f}
                    </li>
                  ))}
                </ul>
                <div className="mt-auto pt-1">
                  {isCurrent ? (
                    billing.hasCustomer ? (
                      <Button variant="secondary" size="sm" className="w-full" loading={busy === "portal"} onClick={() => void go("portal")}>Manage billing</Button>
                    ) : (
                      <Badge tone="green">Current plan</Badge>
                    )
                  ) : (
                    <Button size="sm" variant={p.id === "pro" ? "primary" : "secondary"} className="w-full" disabled={!billing.configured || !p.available} loading={busy === p.id} onClick={() => void go("checkout", p.id)}>
                      {billing.configured && p.available ? (billing.plan === "trial" || billing.complimentary ? `Subscribe · ${p.priceLabel.split(" / ")[0]}/mo` : "Switch") : "Coming soon"}
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
      {billing?.configured && (
        <p className="text-xs text-muted-foreground">Secure card payment by Stripe (Visa, Mastercard, Amex, Apple Pay / Google Pay). Monthly, cancel any time from “Manage billing”; quotas reset on the 1st.</p>
      )}
    </Card>
  )
}
