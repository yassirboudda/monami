"use client"

import { Settings2 } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { Button, Card, Field, Input, PageHeader, Textarea } from "@/components/ui"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Switch } from "@/components/ui/switch"
import { useWorkspaceResource } from "@/lib/use-workspace-resource"
import { PlanCard } from "@/components/oh/plan-card"
import { AnalyticsCard } from "@/components/oh/analytics-card"
import { ConnectorsCard } from "@/components/oh/connectors-card"

type InboxPolicy = { autoReply: boolean; maxAutoDiscountPct: number; tone: string; signature: string }
type Profile = { displayName: string; preferences: Record<string, unknown> & { inbox?: Partial<InboxPolicy> } }

const DEFAULTS: InboxPolicy = {
  autoReply: true,
  maxAutoDiscountPct: 10,
  tone: "friendly and professional, short replies, in the buyer's language",
  signature: "",
}

export default function SettingsPage() {
  const { data, error, isLoading, mutate, request } = useWorkspaceResource<{ profile: Profile }>("/v1/me/profile")
  const [draft, setDraft] = useState<Partial<InboxPolicy>>({})
  const [saving, setSaving] = useState(false)
  const policy: InboxPolicy = { ...DEFAULTS, ...(data?.profile.preferences.inbox ?? {}), ...draft }
  const setPolicy = (fn: (p: InboxPolicy) => InboxPolicy) => setDraft(fn(policy))

  const save = async () => {
    if (!data?.profile) return
    setSaving(true)
    try {
      const pct = Math.max(0, Math.min(90, Math.round(Number(policy.maxAutoDiscountPct) || 0)))
      const next = { ...policy, maxAutoDiscountPct: pct }
      await request("/v1/me/profile", {
        method: "PUT",
        body: { displayName: data.profile.displayName, preferences: { ...data.profile.preferences, inbox: next } },
      })
      await mutate()
      setDraft({})
      toast.success("Settings saved")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Enregistrement impossible")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader label="Account" title="Settings" />

      <Card className="p-5 space-y-5 max-w-2xl">
        <div className="flex items-start gap-3">
          <Settings2 className="w-5 h-5 mt-0.5 text-muted-foreground" />
          <div>
            <h2 className="font-medium">Messagerie autonome</h2>
            <p className="text-sm text-muted-foreground">
              The agent watches the inboxes of your connected marketplaces from the desktop and replies to buyers
              on your behalf, like a human would. Above the maximum discount, it asks for your approval in the chat.
            </p>
          </div>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>Could not load your settings.</AlertDescription>
          </Alert>
        )}

        <label className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card px-4 py-3">
          <span className="text-sm font-medium">Reply to buyers automatically</span>
          <Switch checked={policy.autoReply} onCheckedChange={(v) => setPolicy((p) => ({ ...p, autoReply: v }))} disabled={isLoading} />
        </label>

        <Field label="Maximum discount without my approval (%)" hint="Default 10%. A bigger discount request triggers an approval card in the chat.">
          <Input
            type="number"
            min={0}
            max={90}
            value={policy.maxAutoDiscountPct}
            onChange={(e) => setPolicy((p) => ({ ...p, maxAutoDiscountPct: Number(e.target.value) }))}
            className="max-w-[10rem]"
          />
        </Field>

        <Field label="Reply tone">
          <Textarea value={policy.tone} onChange={(e) => setPolicy((p) => ({ ...p, tone: e.target.value }))} className="min-h-16" />
        </Field>

        <Field label="Signature (optional)">
          <Input value={policy.signature} placeholder="e.g. Yassir — OctoHandy" onChange={(e) => setPolicy((p) => ({ ...p, signature: e.target.value }))} />
        </Field>

        <div className="flex justify-end">
          <Button onClick={() => void save()} loading={saving} disabled={isLoading}>
            Save
          </Button>
        </div>
      </Card>

      <ConnectorsCard />

      <PlanCard />

      <AnalyticsCard />
    </div>
  )
}
