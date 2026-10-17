"use client"

import { Activity, Brain, Eye, ExternalLink, GraduationCap, MonitorSmartphone, RefreshCw, Rocket, ShieldCheck } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { Badge, Button, Card, PageHeader, StatusDot } from "@/components/ui"
import type { TeachSession } from "@/components/teach-workflow"
import type { WorkflowRun } from "@/components/run-workflow"
import { marketplaceName } from "@/components/connect-marketplace"
import { useWorkspaceResource } from "@/lib/use-workspace-resource"

type DesktopStatus = {
  enabled: boolean
  host: string | null
  gate: boolean
  screenpipe: { status: string; ok: boolean } | null
  hermes: boolean
  screen: { window: string; at: string | null; excerpt: string } | null
  model?: string
  checkedAt: string
}

function Tile({ title, ok, detail, icon: Icon }: { title: string; ok: boolean | null; detail: string; icon: typeof Activity }) {
  return (
    <Card className="p-4 flex items-start gap-3">
      <div className="rounded-xl bg-muted/60 p-2"><Icon className="w-4 h-4 text-secondary" /></div>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <StatusDot tone={ok === null ? "amber" : ok ? "green" : "red"} live={!!ok} />
          <p className="font-medium text-sm">{title}</p>
        </div>
        <p className="text-xs text-muted-foreground mt-1 break-words">{detail}</p>
      </div>
    </Card>
  )
}

export default function DesktopPage() {
  const status = useWorkspaceResource<DesktopStatus>("/v1/desktop/status")
  const teach = useWorkspaceResource<{ sessions: TeachSession[] }>("/v1/teach")
  const runs = useWorkspaceResource<{ runs: WorkflowRun[] }>("/v1/workflows/runs")
  const [desktopUrl, setDesktopUrl] = useState<string | null>(null)
  const [opening, setOpening] = useState(false)

  const openDesktop = async () => {
    setOpening(true)
    try {
      const session = await status.request<{ url: string }>("/v1/desktop/sessions", { method: "POST", body: { purpose: "browse" } })
      setDesktopUrl(session.url)
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Bureau indisponible")
    } finally {
      setOpening(false)
    }
  }

  const s = status.data
  const screenAt = s?.screen?.at ? new Date(s.screen.at).toLocaleTimeString("fr-FR") : null

  return (
    <div>
      <PageHeader
        label="Infrastructure"
        title="Bureau OctoHandy"
        subtitle="Un vrai Chrome sur une machine GPU (Brev A4000, IP résidentielle), avec Screenpipe comme mémoire visuelle et l'agent Hermes (NemoClaw · Nebius DeepSeek) à côté. Tes sessions marketplace vivent ici, pas sur ton PC."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => void Promise.all([status.mutate(), teach.mutate(), runs.mutate()])}>
              <RefreshCw className="w-4 h-4" /> Rafraîchir
            </Button>
            <Button onClick={() => void openDesktop()} loading={opening}>
              <MonitorSmartphone className="w-4 h-4" /> Ouvrir le bureau
            </Button>
          </div>
        }
      />

      {status.error ? (
        <Card className="p-4 text-sm text-red-700">Statut indisponible : {status.error.message}</Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <Tile title="Bureau distant" ok={s ? s.gate : null} detail={s?.host ? `${s.host.replace("https://", "")} · noVNC, jeton signé 15 min` : "Chargement…"} icon={MonitorSmartphone} />
          <Tile title="Screenpipe" ok={s ? !!s.screenpipe?.ok : null} detail={s?.screenpipe ? `état ${s.screenpipe.status} · OCR + fenêtres, 24/7` : "non configuré"} icon={Eye} />
          <Tile title="Agent Hermes" ok={s ? s.hermes : null} detail={s?.model ? `NemoClaw sandbox · ${s.model}` : "Chargement…"} icon={Brain} />
          <Tile title="Sortie réseau" ok={s ? s.gate : null} detail="Proxy résidentiel dédié (FR) forcé pour Chrome, aucune sortie directe" icon={ShieldCheck} />
        </div>
      )}

      {s?.screen && (
        <Card className="p-4 mb-6">
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">À l&apos;écran {screenAt && `· ${screenAt}`}</p>
          <p className="font-medium text-sm">{s.screen.window || "Bureau"}</p>
          {s.screen.excerpt && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{s.screen.excerpt}</p>}
        </Card>
      )}

      {desktopUrl && (
        <Card className="p-3 mb-6">
          <div className="rounded-xl overflow-hidden border bg-black aspect-video">
            <iframe src={desktopUrl} title="Bureau distant OctoHandy" className="w-full h-full" allow="clipboard-read; clipboard-write" />
          </div>
          <div className="flex justify-end mt-2">
            <a href={desktopUrl} target="_blank" rel="noreferrer">
              <Button variant="secondary" size="sm"><ExternalLink className="w-4 h-4" /> Plein écran</Button>
            </a>
          </div>
        </Card>
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <GraduationCap className="w-4 h-4 text-secondary" />
            <p className="font-semibold">Démonstrations apprises</p>
          </div>
          {!teach.data?.sessions?.length ? (
            <p className="text-sm text-muted-foreground">Aucune encore. Workflows → « Apprendre en le faisant ».</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {teach.data.sessions.slice(0, 8).map((t) => (
                <li key={t.id} className="flex items-start justify-between gap-2 border-b border-border/60 pb-2 last:border-0">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{t.draft?.title ?? `Session ${marketplaceName(t.marketplace)}`}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(t.startedAt).toLocaleString("fr-FR")} · {t.trace?.frames ?? 0} écrans
                    </p>
                  </div>
                  <Badge tone={t.status === "saved" ? "teal" : t.status === "draft" ? "amber" : "slate"}>{t.status}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <Rocket className="w-4 h-4 text-secondary" />
            <p className="font-semibold">Exécutions de l&apos;agent (journal)</p>
          </div>
          {!runs.data?.runs?.length ? (
            <p className="text-sm text-muted-foreground">Aucune encore. Workflows → « Lancer maintenant ».</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {runs.data.runs.slice(0, 8).map((r) => (
                <li key={r.id} className="border-b border-border/60 pb-2 last:border-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium truncate">{r.plan?.summary ?? r.workflowId}</p>
                    <Badge tone={r.status === "executed" ? "teal" : r.status === "awaiting_approval" ? "amber" : r.status === "rejected" ? "slate" : "blue"}>{r.status}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {new Date(r.createdAt).toLocaleString("fr-FR")} · {r.log.length} action(s) · {r.context?.frames ?? 0} écrans vus
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}
