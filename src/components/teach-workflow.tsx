"use client"

import { Check, CircleDot, GraduationCap, Loader2, Sparkles, Square, Trash2 } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { marketplaceName, useMarketplaceOptions } from "@/components/connect-marketplace"
import { workflowConfidenceLabel, workflowSourceLabel, workflowToolLabel } from "@/components/run-workflow"
import { Badge, Button, Field, Input, MarketplaceLogo, Modal, Textarea } from "@/components/ui"
import { DesktopClipboard } from "@/components/desktop-clipboard"

type Requester = <R>(path: string, options?: { method?: string; body?: unknown }) => Promise<R>

export type TeachDraft = {
  title: string
  trigger?: string
  steps: string[]
  intent?: {
    goal?: string
    actor?: "seller" | "buyer"
    entities?: Record<string, string>
    success_criteria?: string
    constraints?: string[]
  }
  tools?: { tool: string; args?: Record<string, unknown> }[]
  guardrails?: string[]
  tone_notes?: string
  confidence?: "high" | "medium" | "low"
  via?: string
}

export type TeachSession = {
  id: string
  marketplace: string
  status: "recording" | "compiling" | "draft" | "saved" | "discarded" | "abandoned"
  startedAt: string
  endedAt: string | null
  trace: { frames: number; windows: string[] } | null
  draft: TeachDraft | null
  workflowId: string | null
  error: string | null
}

type Phase = "pick" | "recording" | "compiling" | "review"

function formatElapsed(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000))
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`
}

export function TeachWorkflowModal({
  open,
  onClose,
  request,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  request: Requester
  onSaved?: () => void
}) {
  const [phase, setPhase] = useState<Phase>("pick")
  const [marketplace, setMarketplace] = useState<string | null>(null)
  const [session, setSession] = useState<TeachSession | null>(null)
  const [desktopUrl, setDesktopUrl] = useState<string | null>(null)
  const [desktopOpened, setDesktopOpened] = useState(false)
  const [busy, setBusy] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [title, setTitle] = useState("")
  const [stepsText, setStepsText] = useState("")
  const marketplaces = useMarketplaceOptions(request, open)

  useEffect(() => {
    if (phase !== "recording" || !session) return
    const startedAt = new Date(session.startedAt).getTime()
    const timer = window.setInterval(() => setElapsed(Date.now() - startedAt), 1000)
    return () => window.clearInterval(timer)
  }, [phase, session])

  const start = async (mp: string) => {
    setMarketplace(mp)
    setBusy(true)
    try {
      const res = await request<{ session: TeachSession; desktop: { url: string; opened: boolean } }>("/v1/teach/start", {
        method: "POST",
        body: { marketplace: mp },
      })
      setSession(res.session)
      setDesktopUrl(res.desktop.url)
      setDesktopOpened(res.desktop.opened)
      setPhase("recording")
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Impossible de démarrer l'apprentissage")
    } finally {
      setBusy(false)
    }
  }

  const stop = async () => {
    if (!session) return
    setPhase("compiling")
    try {
      const res = await request<{ session: TeachSession }>(`/v1/teach/${session.id}/stop`, { method: "POST" })
      setSession(res.session)
      setTitle(res.session.draft?.title ?? "")
      setStepsText((res.session.draft?.steps ?? []).join("\n"))
      setPhase("review")
      if (res.session.error) toast.warning(res.session.error)
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "La compilation a échoué")
      setPhase("recording")
    }
  }

  const save = async () => {
    if (!session) return
    setBusy(true)
    try {
      await request(`/v1/teach/${session.id}/save`, {
        method: "POST",
        body: { title, steps: stepsText.split("\n").map((s) => s.trim()).filter(Boolean) },
      })
      await request("/v1/desktop/release", { method: "POST" }).catch(() => undefined)
      toast.success("Workflow enregistré. Active-le quand tu veux.")
      onSaved?.()
      onClose()
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Impossible d'enregistrer le workflow")
    } finally {
      setBusy(false)
    }
  }

  const discard = async () => {
    if (session && session.status !== "saved") {
      try {
        await request(`/v1/teach/${session.id}`, { method: "DELETE" })
        toast.info(phase === "recording" ? "Enregistrement annulé, session fermée." : "Brouillon jeté.")
      } catch {
        toast.error("Impossible de fermer la session côté serveur")
      }
    }
    await request("/v1/desktop/release", { method: "POST" }).catch(() => undefined)
    onClose()
  }

  const name = marketplace ? marketplaceName(marketplace, marketplaces) : null
  const draft = session?.draft

  return (
    <Modal open={open} onClose={() => void discard()} title={name ? `Apprendre en le faisant · ${name}` : "Apprendre en le faisant"} wide>
      {phase === "pick" && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Montre une fois à l&apos;agent comment tu fais : on ouvre ton Chrome du bureau OctoHandy, tu réalises la
            tâche normalement (répondre à un message, envoyer une offre après un favori…), puis Hermes transforme la
            démonstration Screenpipe en workflow que tu valides.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {marketplaces.map((m) => (
              <button
                key={m.id}
                type="button"
                disabled={busy}
                onClick={() => void start(m.id)}
                className="flex flex-col items-center gap-2 rounded-xl border bg-white p-4 text-sm font-medium hover:border-primary hover:shadow-sm transition disabled:opacity-50"
              >
                {busy && marketplace === m.id ? <Loader2 className="w-9 h-9 animate-spin text-muted-foreground" /> : <MarketplaceLogo marketplace={m.id} size={36} />}
                {m.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {phase === "recording" && desktopUrl && (
        <div className="space-y-3">
          {!desktopOpened && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              La page n&apos;a pas pu s&apos;ouvrir automatiquement. Ouvre-la manuellement dans le navigateur du bureau.
            </p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-2 text-sm font-medium text-red-600">
              <CircleDot className="w-4 h-4 animate-pulse" /> Enregistrement · {formatElapsed(elapsed)}
            </span>
            <span className="text-xs text-muted-foreground">Fais l&apos;action une fois, comme d&apos;habitude, puis clique Stop.</span>
          </div>
          <div className="rounded-xl overflow-hidden border bg-black aspect-video">
            <iframe src={desktopUrl} title="Bureau distant OctoHandy" className="w-full h-full" allow="clipboard-read; clipboard-write" />
          </div>
          <DesktopClipboard compact />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => void discard()}>
              <Trash2 className="w-4 h-4" /> Annuler
            </Button>
            <Button size="sm" onClick={() => void stop()}>
              <Square className="w-4 h-4" /> Stop, c&apos;est fait
            </Button>
          </div>
        </div>
      )}

      {phase === "compiling" && (
        <div className="flex flex-col items-center gap-3 py-12 text-sm text-muted-foreground">
          <Loader2 className="w-8 h-8 animate-spin" />
          Hermes relit ta démonstration (Screenpipe) et rédige le workflow…
        </div>
      )}

      {phase === "review" && session && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Sparkles className="w-4 h-4 text-secondary" />
            {session.trace?.frames ?? 0} écrans analysés
            {draft?.confidence && <Badge tone={draft.confidence === "high" ? "teal" : draft.confidence === "medium" ? "amber" : "slate"}>confiance {workflowConfidenceLabel(draft.confidence)}</Badge>}
            {draft?.via && <Badge tone="slate">source : {workflowSourceLabel(draft.via)}</Badge>}
          </div>
          <Field label="Titre">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          {draft?.trigger && <p className="text-sm"><span className="font-medium">Déclencheur :</span> {draft.trigger}</p>}
          {draft?.intent?.goal && <p className="text-sm"><span className="font-medium">Objectif :</span> {draft.intent.goal}</p>}
          {draft?.intent?.success_criteria && <p className="text-sm"><span className="font-medium">Résultat attendu :</span> {draft.intent.success_criteria}</p>}
          <Field label="Étapes (une par ligne)">
            <Textarea rows={6} value={stepsText} onChange={(e) => setStepsText(e.target.value)} />
          </Field>
          {!!draft?.tools?.length && (
            <div className="flex flex-wrap gap-1.5">
              {draft.tools.map((t, i) => (
                <Badge key={`${t.tool}-${i}`} tone="blue">{workflowToolLabel(t.tool)}</Badge>
              ))}
            </div>
          )}
          {!!draft?.guardrails?.length && (
            <ul className="text-xs text-muted-foreground list-disc pl-5 space-y-0.5">
              {draft.guardrails.map((g) => <li key={g}>{g}</li>)}
            </ul>
          )}
          {draft?.tone_notes && <p className="text-xs text-muted-foreground italic">Ton : {draft.tone_notes}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => void discard()}>
              <Trash2 className="w-4 h-4" /> Jeter
            </Button>
            <Button size="sm" loading={busy} onClick={() => void save()}>
              <Check className="w-4 h-4" /> Enregistrer le workflow
            </Button>
          </div>
        </div>
      )}
      {phase === "pick" && (
        <p className="mt-4 text-xs text-muted-foreground flex items-center gap-1.5">
          <GraduationCap className="w-3.5 h-3.5" /> Screenpipe tourne sur le bureau OctoHandy : rien n&apos;est installé sur ton PC.
        </p>
      )}
    </Modal>
  )
}
