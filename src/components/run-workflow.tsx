"use client"

import { AlertTriangle, Check, ExternalLink, Loader2, MonitorSmartphone, Play, X } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Badge, Button, Segmented } from "@/components/ui"
import { ModalOrCard } from "@/components/chat-card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { buttonVariants } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"

type Requester = <R>(path: string, options?: { method?: string; body?: unknown }) => Promise<R>

export type RunAction = {
  tool: string
  args: Record<string, unknown>
  preview: string
  needs_approval: boolean
  target_text?: string
  input_text?: string
  submit?: boolean
}
export type RunPlan = { summary: string; situation?: string; actions: RunAction[]; risks?: string[]; ask_user?: string; via?: string }
export type RunLog = {
  t: string
  tool: string
  result: string
  detail: string
  preview?: string
  searched?: string
  matched?: string | null
  confidence?: number | null
  coordinates?: { x: number; y: number } | null
  evidence?: string
  outcome?: string
}
export type WorkflowRun = {
  id: string
  workflowId: string
  status: "planning" | "awaiting_approval" | "executing" | "executed" | "rejected" | "failed"
  mode: string
  context: { frames: number; windows: string[] } | null
  plan: RunPlan | null
  log: RunLog[]
  error: string | null
  createdAt: string
  updatedAt: string
}

export function workflowToolLabel(tool: string) {
  return ({
    list_unread_messages: "List unread messages",
    read_thread: "Read a conversation",
    send_message: "Send a message",
    list_favorites: "Check favourites",
    list_offers: "Check offers",
    send_offer: "Send an offer",
    get_listing: "Open a listing",
    update_price: "Change the price",
    republish_listing: "Republish a listing",
    list_notifications: "Check notifications",
    wait_for_event: "Wait for an event",
    notify_seller: "Notify the seller",
  } as Record<string, string>)[tool] ?? tool.replace(/_/g, " ")
}

export function workflowSourceLabel(source: string) {
  return ({ hermes: "MonAmi agent", nebius: "cloud model", fallback: "fallback mode", mock: "simulation" } as Record<string, string>)[source] ?? source
}

export function workflowConfidenceLabel(confidence: string) {
  return ({ high: "high", medium: "medium", low: "low" } as Record<string, string>)[confidence] ?? confidence
}

function resultLabel(result: string) {
  return ({
    assisted: "assisted",
    clicked: "clicked",
    skipped: "skipped",
    failed: "failed",
    partial: "partiel",
  } as Record<string, string>)[result] ?? result
}

export function RunWorkflowModal({
  workflow,
  onClose,
  request,
  inline = false,
}: {
  workflow: { id: string; title: string; marketplace: string } | null
  onClose: () => void
  request: Requester
  /** Render as a card in the chat instead of a modal. */
  inline?: boolean
}) {
  const [run, setRun] = useState<WorkflowRun | null>(null)
  const [busy, setBusy] = useState(false)
  const [selected, setSelected] = useState<number[]>([])
  const [desktopUrl, setDesktopUrl] = useState<string | null>(null)
  const [mode, setMode] = useState<"assisted" | "auto_click">("assisted")

  useEffect(() => {
    if (!workflow) return
    let cancelled = false
    request<{ run: WorkflowRun }>(`/v1/workflows/${workflow.id}/run`, { method: "POST" })
      .then(({ run: next }) => {
        if (cancelled) return
        setRun(next)
        setSelected((next.plan?.actions ?? []).map((_, i) => i))
      })
      .catch((cause: unknown) => {
        if (!cancelled) toast.error(cause instanceof Error ? cause.message : "Hermes could not prepare the plan")
      })
    return () => {
      cancelled = true
    }
  }, [workflow, request])

  const workflowId = workflow?.id
  const runId = run?.id
  const runStatus = run?.status

  useEffect(() => {
    if (!workflowId || !runId || runStatus !== "executing") return
    let cancelled = false
    const timer = window.setInterval(() => {
      void request<{ runs: WorkflowRun[] }>(`/v1/workflows/runs?workflow_id=${encodeURIComponent(workflowId)}`)
        .then(({ runs }) => {
          const latest = runs.find((item) => item.id === runId)
          if (!cancelled && latest) setRun(latest)
        })
        .catch(() => undefined)
    }, 2000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [workflowId, runId, runStatus, request])

  const approve = async () => {
    if (!run) return
    setBusy(true)
    try {
      let desktop: { url: string } | null = null
      try {
        desktop = await request<{ url: string }>("/v1/desktop/sessions", {
          method: "POST",
          body: { marketplace: workflow?.marketplace, purpose: "browse" },
        })
      } catch (cause) {
        if (mode === "auto_click") throw cause
        toast.warning("The remote desktop is unavailable; the run will stay assisted.")
      }
      const { run: next } = await request<{ run: WorkflowRun }>(`/v1/workflows/runs/${run.id}/approve`, {
        method: "POST",
        body: { approved_indexes: selected, mode },
      })
      setRun(next)
      setDesktopUrl(desktop?.url ?? null)
      toast.success(mode === "auto_click" ? "Actions approved, run started on the desktop." : "Plan executed in assisted mode")
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Could not run")
    } finally {
      setBusy(false)
    }
  }

  const reject = async () => {
    if (run && run.status === "awaiting_approval") {
      await request(`/v1/workflows/runs/${run.id}/reject`, { method: "POST" }).catch(() => undefined)
    }
    if (run?.status !== "executing") {
      await request("/v1/desktop/release", { method: "POST" }).catch(() => undefined)
    }
    onClose()
  }

  const close = async () => {
    await request("/v1/desktop/release", { method: "POST" }).catch(() => undefined)
    onClose()
  }

  const plan = run?.plan

  return (
    <ModalOrCard inline={inline} open={!!workflow} onClose={() => void reject()} title={workflow ? `Run · ${workflow.title}` : "Run"}>
      {!run && (
        <div className="flex flex-col items-center gap-3 py-12 text-sm text-muted-foreground">
          <Loader2 className="w-8 h-8 animate-spin" />
          MonAmi is looking at your desktop and preparing the plan…
        </div>
      )}

      {run && plan && run.status === "awaiting_approval" && (
        <div className="space-y-4">
          <div>
            <p className="font-medium">{plan.summary}</p>
            {plan.situation && <p className="text-sm text-muted-foreground mt-1">{plan.situation}</p>}
            <p className="text-xs text-muted-foreground mt-1">
              {run.context?.frames ?? 0} screens analysed {plan.via && <Badge tone="slate">source: {workflowSourceLabel(plan.via)}</Badge>}
            </p>
          </div>
          {plan.ask_user && (
            <Alert className="border-amber-200 bg-amber-50 text-amber-900">
              <AlertTriangle />
              <AlertDescription className="text-amber-900">{plan.ask_user}</AlertDescription>
            </Alert>
          )}
          <div className="grid gap-1.5">
            <span className="text-sm font-medium leading-none">Run mode</span>
            <Segmented
              value={mode}
              onChange={setMode}
              options={[
                { value: "assisted", label: "Assisted, no automatic clicks" },
                { value: "auto_click", label: "Clicks after approval" },
              ]}
            />
          </div>
          <p className="text-xs text-muted-foreground">Only the ticked actions will run, after your approval.</p>
          <ul className="space-y-2">
            {plan.actions.map((action, index) => (
              <li key={`${action.tool}-${index}`} className="rounded-lg border p-3 flex gap-3 items-start">
                <Checkbox
                  className="mt-0.5"
                  checked={selected.includes(index)}
                  onCheckedChange={(checked) => setSelected(checked === true ? [...selected, index] : selected.filter((i) => i !== index))}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="blue">{workflowToolLabel(action.tool)}</Badge>
                    {action.needs_approval && <Badge tone="amber">approbation requise</Badge>}
                    {!!Object.keys(action.args).length && (
                      <span className="text-xs text-muted-foreground truncate">{JSON.stringify(action.args)}</span>
                    )}
                  </div>
                  {action.preview && <p className="mt-2 text-sm whitespace-pre-wrap rounded-md bg-muted p-2">{action.preview}</p>}
                  {action.target_text && <p className="mt-1 text-xs text-muted-foreground">On-screen target: {action.target_text}</p>}
                  {action.input_text && <p className="mt-1 text-xs text-muted-foreground">Text to type: {action.input_text}</p>}
                </div>
              </li>
            ))}
          </ul>
          {!!plan.risks?.length && (
            <ul className="text-xs text-muted-foreground list-disc pl-5 space-y-0.5">
              {plan.risks.map((risk) => <li key={risk}>{risk}</li>)}
            </ul>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => void reject()}>
              <X className="w-4 h-4" /> Decline
            </Button>
            <Button size="sm" loading={busy} disabled={!selected.length} onClick={() => void approve()}>
              <Check className="w-4 h-4" /> Approve and run ({selected.length})
            </Button>
          </div>
        </div>
      )}

      {run && (run.status === "executing" || run.status === "executed" || run.status === "failed") && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {run.status === "executing"
              ? "Running on the desktop. The log updates automatically."
              : run.status === "failed"
                ? run.error ?? "The run failed. See the log below."
                : run.mode === "auto_click"
                  ? "The desktop executed the approved actions. Check the results and the elements recognised on screen."
                  : "Assisted mode: the approved messages are ready in the clipboard. Check them and send them from the desktop."}
          </p>
          <ol className="space-y-2 text-sm max-h-96 overflow-y-auto">
            {run.log.map((entry, index) => (
              <li key={`${entry.tool}-${index}`} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="blue">{workflowToolLabel(entry.tool)}</Badge>
                  <Badge tone={entry.result === "assisted" || entry.result === "clicked" ? "teal" : entry.result === "skipped" ? "slate" : "amber"}>{resultLabel(entry.result)}</Badge>
                  <span className="text-xs text-muted-foreground">{new Date(entry.t).toLocaleTimeString("en-GB")}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{entry.detail}</p>
                {entry.searched && <p className="text-xs mt-1">Searched target: {entry.searched}</p>}
                {entry.matched && (
                  <p className="text-xs mt-1">
                    Recognised element: {entry.matched}
                    {entry.confidence != null ? ` · confiance ${Math.round(entry.confidence)} %` : ""}
                    {entry.coordinates ? ` · position ${entry.coordinates.x}, ${entry.coordinates.y}` : ""}
                  </p>
                )}
                {entry.evidence && <p className="text-xs text-muted-foreground mt-1">Screen after action: {entry.evidence}</p>}
              </li>
            ))}
          </ol>
          {desktopUrl && (
            <div className="rounded-lg overflow-hidden border bg-black aspect-video">
              <iframe src={desktopUrl} title="MonAmi remote desktop" className="w-full h-full" allow="clipboard-read; clipboard-write" />
            </div>
          )}
          <div className="flex justify-end gap-2">
            {desktopUrl && (
              <a href={desktopUrl} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "outline", size: "sm" })}>
                <ExternalLink className="w-4 h-4" /> Full screen
              </a>
            )}
            <Button size="sm" onClick={() => void close()}>
              <MonitorSmartphone className="w-4 h-4" /> Finish
            </Button>
          </div>
        </div>
      )}
      {run && run.status === "rejected" && (
        <p className="text-sm text-muted-foreground flex items-center gap-2"><Play className="w-4 h-4" /> Run declined.</p>
      )}
    </ModalOrCard>
  )
}
