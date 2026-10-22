"use client"

import { Activity } from "lucide-react"
import { Badge, Card, Skeleton } from "@/components/ui"
import { useWorkspaceResource } from "@/lib/use-workspace-resource"

type Summary = {
  configured: boolean
  stream: boolean
  days: number
  totals: Record<string, number>
  byDay: ({ day: string } & Record<string, number | string>)[]
  byMarketplace: { marketplace: string; repliesSent: number; decisions: number; runs: number }[]
  avgAgentSeconds: number | null
  source?: string
  retentionDays?: number
  error?: string
}

const KINDS: { key: string; label: string }[] = [
  { key: "agent.reply_sent", label: "Buyer replies sent" },
  { key: "agent.approval_requested", label: "Approvals asked" },
  { key: "agent.approval_decided", label: "Decisions taken" },
  { key: "desktop.run", label: "Desktop runs" },
  { key: "chat.message", label: "Chat requests" },
  { key: "shop.synced", label: "Shop refreshes" },
]

const DAY_KINDS = ["agent.reply_sent", "desktop.run", "chat.message"]

export function AnalyticsCard() {
  const { data, isLoading } = useWorkspaceResource<{ analytics: Summary }>("/v1/analytics/summary?days=14")
  const a = data?.analytics
  const max = Math.max(1, ...(a?.byDay ?? []).map((d) => DAY_KINDS.reduce((s, k) => s + Number(d[k] ?? 0), 0)))

  return (
    <Card className="p-5 space-y-5 max-w-2xl">
      <div className="flex items-start gap-3">
        <Activity className="w-5 h-5 mt-0.5 text-muted-foreground" />
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h2 className="font-medium">Agent activity</h2>
            <p className="text-caption">{a?.retentionDays ? `Stored on Aiven · kept ${a.retentionDays} days · ${a.source === "clickhouse" ? "full history" : "PostgreSQL"}` : "Stored on Aiven"}</p>
            {a && (
              <Badge tone={a.configured ? "green" : "slate"}>{a.configured ? "Last 14 days" : "Not configured"}</Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Everything the agent does — replies, approvals, desktop runs — is streamed through Aiven for Apache Kafka
            and analysed in Aiven for ClickHouse.
          </p>
        </div>
      </div>

      {isLoading && <Skeleton className="h-24 w-full" />}

      {a && a.error && <p className="text-sm text-amber-700">{a.error}</p>}

      {a && !a.error && (
        <>
          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {KINDS.map((k) => (
              <div key={k.key} className="rounded-lg border p-3">
                <dt className="text-xs text-muted-foreground">{k.label}</dt>
                <dd className="text-xl font-semibold tabular-nums">{a.totals[k.key] ?? 0}</dd>
              </div>
            ))}
          </dl>

          {a.avgAgentSeconds != null && (
            <p className="text-sm text-muted-foreground">
              Average agent answer time: <span className="font-medium text-foreground">{a.avgAgentSeconds}s</span>
            </p>
          )}

          {a.byDay.length > 0 && (
            <div className="flex items-end gap-1 h-20" aria-label="Activity per day">
              {a.byDay.map((d) => {
                const total = DAY_KINDS.reduce((s, k) => s + Number(d[k] ?? 0), 0)
                return (
                  <div
                    key={d.day}
                    title={`${d.day}: ${total} action${total === 1 ? "" : "s"}`}
                    className="flex-1 rounded-t bg-primary/70 min-w-[6px]"
                    style={{ height: `${Math.max(4, (total / max) * 100)}%` }}
                  />
                )
              })}
            </div>
          )}

          {a.byMarketplace.length > 0 && (
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th className="text-left font-medium py-1">Marketplace</th>
                  <th className="text-right font-medium py-1">Replies</th>
                  <th className="text-right font-medium py-1">Decisions</th>
                  <th className="text-right font-medium py-1">Runs</th>
                </tr>
              </thead>
              <tbody>
                {a.byMarketplace.map((m) => (
                  <tr key={m.marketplace} className="border-t">
                    <td className="py-1.5 capitalize">{m.marketplace}</td>
                    <td className="py-1.5 text-right tabular-nums">{m.repliesSent}</td>
                    <td className="py-1.5 text-right tabular-nums">{m.decisions}</td>
                    <td className="py-1.5 text-right tabular-nums">{m.runs}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {a.configured && Object.keys(a.totals).length === 0 && (
            <p className="text-sm text-muted-foreground">No activity yet — ask the agent something in the chat.</p>
          )}
        </>
      )}
    </Card>
  )
}
