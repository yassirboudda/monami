"use client"

import { Check, CreditCard } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Badge, Button, Card } from "@/components/ui"
import { useWorkspaceResource } from "@/lib/use-workspace-resource"

type Plan = { id: string; name: string; priceLabel: string; features: string[] }
type Billing = {
  configured: boolean
  plan: "free" | "pro"
  complimentary: boolean
  status: string
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
  hasCustomer: boolean
  plans: Plan[]
}

export function PlanCard() {
  const { data, isLoading, mutate, request } = useWorkspaceResource<{ billing: Billing }>("/v1/billing")
  const [busy, setBusy] = useState<"checkout" | "portal" | null>(null)
  const billing = data?.billing

  useEffect(() => {
    const flag = new URLSearchParams(window.location.search).get("billing")
    if (!flag) return
    if (flag === "success") toast.success("Welcome to Pro — your subscription is active.")
    if (flag === "cancel") toast("Checkout cancelled, you are still on the Free plan.")
    window.history.replaceState({}, "", window.location.pathname)
    void mutate()
  }, [mutate])

  async function go(kind: "checkout" | "portal") {
    setBusy(kind)
    try {
      const { url } = await request<{ url: string }>(`/v1/billing/${kind}`, { method: "POST" })
      window.location.assign(url)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Billing is unavailable right now.")
      setBusy(null)
    }
  }

  const renews = billing?.currentPeriodEnd
    ? new Date(billing.currentPeriodEnd).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    : null

  return (
    <Card className="p-5 space-y-5 max-w-2xl">
      <div className="flex items-start gap-3">
        <CreditCard className="w-5 h-5 mt-0.5 text-muted-foreground" />
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h2 className="font-medium">Plan</h2>
            {billing && (
              <Badge tone={billing.plan === "pro" ? "amber" : "slate"}>
                {billing.plan === "pro" ? "Pro" : "Free"}
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {billing?.plan === "pro"
              ? billing.complimentary
                ? "Pro access included with your account."
                : billing.cancelAtPeriodEnd
                  ? `Pro until ${renews} — your plan then goes back to Free.`
                  : renews
                    ? `Pro, renews on ${renews}.`
                    : "Pro subscription active."
              : "Free: one marketplace, every reply approved by you. Pro unlocks the inbox autopilot and unlimited marketplaces."}
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {(billing?.plans ?? []).map((plan) => {
          const current = billing?.plan === plan.id
          return (
            <div
              key={plan.id}
              className={`rounded-lg border p-4 space-y-3 ${current ? "border-primary/60 bg-primary/5" : ""}`}
            >
              <div className="flex items-baseline justify-between">
                <span className="font-medium">{plan.name}</span>
                <span className="text-sm text-muted-foreground">{plan.priceLabel}</span>
              </div>
              <ul className="space-y-1.5 text-sm">
                {plan.features.map((f) => (
                  <li key={f} className="flex gap-2">
                    <Check className="w-4 h-4 mt-0.5 shrink-0 text-primary" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              {plan.id === "pro" && billing && !billing.complimentary && (
                current ? (
                  <Button
                    variant="secondary"
                    className="w-full"
                    loading={busy === "portal"}
                    onClick={() => void go("portal")}
                  >
                    Manage billing
                  </Button>
                ) : (
                  <Button
                    className="w-full"
                    loading={busy === "checkout"}
                    disabled={isLoading || !billing.configured}
                    onClick={() => void go("checkout")}
                  >
                    {billing.configured ? "Upgrade to Pro" : "Coming soon"}
                  </Button>
                )
              )}
              {plan.id === "free" && current && (
                <p className="text-xs text-muted-foreground">Your current plan</p>
              )}
            </div>
          )
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        Payments are handled by Stripe. Cancel anytime from “Manage billing”.
      </p>
    </Card>
  )
}
