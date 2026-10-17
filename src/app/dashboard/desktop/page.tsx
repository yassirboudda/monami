"use client"

import { Activity, Brain, Eye, ExternalLink, GraduationCap, MonitorSmartphone, RefreshCw, Rocket, ShieldCheck } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { Badge, Button, Card, PageHeader, StatusDot } from "@/components/ui"
import type { TeachSession } from "@/components/teach-workflow"
import type { WorkflowRun } from "@/components/run-workflow"
import { marketplaceName } from "@/components/connect-marketplace"
import { useWorkspaceResource } from "@/lib/use-workspace-resource"
import { DesktopClipboard } from "@/components/desktop-clipboard"

type ScreenTrace = {
  minutes: number
  frames: number
  windows: string[]
  events: { t: string; kind: string; app: string; window: string; text: string }[]
  checkedAt: string
}

type DesktopStatus = {
  enabled: boolean
  host: string | null
  gate: boolean
  screenpipe: { status: string; ok: boolean } | null
  hermes: boolean
  screen: { window: string; url?: string | null; at: string | null; excerpt: string; raw?: string } | null
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
  const screen = useWorkspaceResource<ScreenTrace>("/v1/desktop/screen?minutes=2")
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
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => void Promise.all([status.mutate(), teach.mutate(), runs.mutate(), screen.mutate()])}>
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
          <Tile title="Screenpipe" ok={s ? (s.screenpipe?.ok ? true : s.screenpipe?.status === "degraded" ? null : false) : null} detail={s?.screenpipe ? (s.screenpipe.ok ? "OCR + fenêtres, 24/7" : s.screenpipe.status === "degraded" ? "dégradé : captures en retard, redémarrage en cours" : "injoignable sur le A4000") : "non configuré"} icon={Eye} />
          <Tile title="Agent Hermes" ok={s ? s.hermes : null} detail={s?.model ? `NemoClaw sandbox · ${s.model}` : "Chargement…"} icon={Brain} />
          <Tile title="Sortie réseau" ok={s ? s.gate : null} detail="Proxy résidentiel dédié (FR) forcé pour Chrome, aucune sortie directe" icon={ShieldCheck} />
        </div>
      )}

      {s?.screen && (
        <Card className="p-4 mb-6">
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">À l&apos;écran {screenAt && `· ${screenAt}`}</p>
          <p className="font-medium text-sm">{s.screen.window || "Bureau OctoHandy"}</p>
          {s.screen.url && <p className="text-xs text-muted-foreground truncate">{s.screen.url}</p>}
          {s.screen.excerpt && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{s.screen.excerpt}</p>}
          {s.screen.raw && (
            <details className="mt-1">
              <summary className="text-[11px] text-muted-foreground cursor-pointer">Texte brut lu par Screenpipe (OCR)</summary>
              <p className="text-[11px] text-muted-foreground mt-1 break-words">{s.screen.raw}</p>
            </details>
          )}
        </Card>
      )}

      <Card className="p-5 mb-6">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4 text-secondary" />
            <p className="font-semibold">Ce que l&apos;agent a vu à l&apos;écran (2 dernières minutes)</p>
          </div>
          <div className="flex items-center gap-2">
            {screen.data && <Badge tone={screen.data.frames ? "teal" : "amber"}>{screen.data.frames} frames</Badge>}
            <Button variant="secondary" size="sm" onClick={() => void screen.mutate()} loading={screen.isLoading}>
              <RefreshCw className="w-3.5 h-3.5" /> Relire l&apos;écran
            </Button>
          </div>
        </div>
        {screen.error ? (
          <p className="text-sm text-red-700">Screenpipe injoignable : {screen.error.message}</p>
        ) : !screen.data ? (
          <p className="text-sm text-muted-foreground">Lecture…</p>
        ) : !screen.data.events.length ? (
          <p className="text-sm text-muted-foreground">Rien capturé sur les 2 dernières minutes (écran statique ou bureau inactif). Ouvre le bureau et bouge dans Chrome, puis relis.</p>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {screen.data.events.map((e, i) => (
              <li key={`${e.t}-${i}`} className="flex gap-3">
                <span className="text-xs text-muted-foreground tabular-nums shrink-0 pt-0.5">{e.t ? new Date(e.t).toLocaleTimeString("fr-FR") : "—"}</span>
                <div className="min-w-0">
                  <p className="font-medium truncate">{e.window ? `Chrome · ${e.window}` : e.app || "Bureau OctoHandy"}</p>
                  {e.text ? <p className="text-xs text-muted-foreground line-clamp-2">{e.text}</p> : <p className="text-xs text-muted-foreground italic">page sans texte lisible</p>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {desktopUrl && (
        <Card className="p-3 mb-6">
          <div className="rounded-xl overflow-hidden border bg-black aspect-video">
            <iframe src={desktopUrl} title="Bureau distant OctoHandy" className="w-full h-full" allow="clipboard-read; clipboard-write" />
          </div>
          <DesktopClipboard compact={false} />
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
