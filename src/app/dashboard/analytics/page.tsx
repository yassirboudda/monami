"use client"

import { Activity, BarChart3, Clock, Database, Package, Search, Sparkles, TrendingDown, TrendingUp } from "lucide-react"
import Link from "next/link"
import { Badge, Card, EmptyState, MarketplaceLogo, PageHeader, Skeleton } from "@/components/ui"
import { Progress } from "@/components/ui/progress"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useWorkspaceResource } from "@/lib/use-workspace-resource"
import { cn } from "@/lib/utils"

type Activity = {
  configured: boolean
  days: number
  totals: Record<string, number>
  byDay: ({ day: string } & Record<string, number | string>)[]
  byMarketplace: { marketplace: string; repliesSent: number; decisions: number; runs: number }[]
  avgAgentSeconds: number | null
  source?: string
  retentionDays?: number
  error?: string
}
type Dashboard = {
  activity: Activity
  plan: { id: string; name: string; complimentary: boolean; usage: { period: string; desktopSeconds: number; aiTokens: number }; quota: { desktopMinutes: number; aiTokens: number } }
  stock: {
    listings: number; asking: number; priced: number; marketValue: number; overpriced: number; underpriced: number
    byMarketplace: { marketplace: string; listings: number; asking: number; views: number; favorites: number; shops: number }[]
  }
  searches: { marketplace: string; keyword: string; median: number; n: number; lastAt: string; lookups: number; trendPct: number | null; series: number[] }[]
}

const DAY_KINDS: { key: string; label: string; color: string }[] = [
  { key: "agent.reply_sent", label: "Replies to buyers", color: "var(--primary)" },
  { key: "desktop.run", label: "Desktop actions", color: "var(--horizon)" },
  { key: "chat.message", label: "Chat requests", color: "#b08968" },
  { key: "market.comps", label: "Market lookups", color: "#8da399" },
  { key: "desktop.session", label: "Desktop sessions", color: "#c9a227" },
]
const eur = (n: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n)
const fmtTokens = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(n % 1_000_000 ? 1 : 0)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n))
const fmtMinutes = (m: number) => (m >= 1440 ? `${Math.round(m / 60)} h` : m >= 60 ? `${(m / 60).toFixed(m % 60 ? 1 : 0)} h` : `${Math.round(m)} min`)
const sumKinds = (d: Record<string, number | string>) => DAY_KINDS.reduce((s, k) => s + Number(d[k.key] ?? 0), 0)

function lastDays(n: number) {
  const out: string[] = []
  const now = new Date()
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now)
    d.setUTCDate(now.getUTCDate() - i)
    out.push(d.toISOString().slice(0, 10))
  }
  return out
}

function Kpi({ icon: Icon, label, value, hint, tone }: { icon: typeof Clock; label: string; value: string; hint?: string; tone?: "up" | "down" }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="w-3.5 h-3.5" /> {label}
      </div>
      <div className={cn("mt-1 text-2xl font-semibold tracking-tight tabular-nums", tone === "up" && "text-emerald-700", tone === "down" && "text-destructive")}>{value}</div>
      {hint && <div className="text-xs text-muted-foreground mt-0.5">{hint}</div>}
    </Card>
  )
}

function ActivityChart({ byDay, days }: { byDay: Activity["byDay"]; days: number }) {
  const idx = new Map(byDay.map((d) => [d.day, d]))
  const series: Activity["byDay"] = lastDays(days).map((day) => ({ ...(idx.get(day) ?? {}), day }))
  const max = Math.max(1, ...series.map(sumKinds))
  const W = 720, H = 160, pad = 4
  const bw = (W - pad * 2) / series.length
  return (
    <div className="space-y-3">
      <svg viewBox={`0 0 ${W} ${H + 18}`} className="w-full h-44" role="img" aria-label="Agent actions per day">
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <line key={f} x1={pad} x2={W - pad} y1={H - H * f} y2={H - H * f} stroke="currentColor" strokeOpacity={0.08} />
        ))}
        {series.map((d, i) => {
          let y = H
          const total = sumKinds(d)
          return (
            <g key={d.day}>
              <title>{`${d.day}: ${total} action${total === 1 ? "" : "s"}`}</title>
              {DAY_KINDS.map((k) => {
                const v = Number(d[k.key] ?? 0)
                if (!v) return null
                const h = (v / max) * (H - 8)
                y -= h
                return <rect key={k.key} x={pad + i * bw + bw * 0.18} y={y} width={bw * 0.64} height={h} rx={2} fill={k.color} />
              })}
              {(i === 0 || i === series.length - 1 || i % Math.ceil(series.length / 6) === 0) && (
                <text x={pad + i * bw + bw / 2} y={H + 14} textAnchor="middle" fontSize={10} fill="currentColor" fillOpacity={0.55}>{d.day.slice(5)}</text>
              )}
            </g>
          )
        })}
      </svg>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {DAY_KINDS.map((k) => (
          <span key={k.key} className="inline-flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: k.color }} /> {k.label}</span>
        ))}
      </div>
    </div>
  )
}

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return <span className="text-xs text-muted-foreground">—</span>
  const W = 90, H = 24
  const min = Math.min(...values), max = Math.max(...values)
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * W},${H - 2 - ((v - min) / (max - min || 1)) * (H - 4)}`).join(" ")
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-[90px] h-6" aria-hidden>
      <polyline points={pts} fill="none" stroke="var(--primary)" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

export default function AnalyticsPage() {
  const { data, error, isLoading } = useWorkspaceResource<{ dashboard: Dashboard }>("/v1/analytics/dashboard?days=30")
  const d = data?.dashboard
  const a = d?.activity
  const actions = a ? Object.entries(a.totals).reduce((s, [k, v]) => (k.startsWith("billing.") ? s : s + v), 0) : 0
  const desktopMin = d ? d.plan.usage.desktopSeconds / 60 : 0
  const deskPct = d && d.plan.quota.desktopMinutes ? Math.min(100, Math.round((desktopMin / d.plan.quota.desktopMinutes) * 100)) : 0
  const tokPct = d && d.plan.quota.aiTokens ? Math.min(100, Math.round((d.plan.usage.aiTokens / d.plan.quota.aiTokens) * 100)) : 0
  const gap = d && d.stock.priced ? d.stock.asking - d.stock.marketValue : null

  return (
    <div className="space-y-6">
      <PageHeader
        label="Your numbers"
        title="Analytics"
        subtitle={
          <span className="inline-flex items-center gap-2 flex-wrap">
            <Database className="w-3.5 h-3.5" />
            {a?.retentionDays ? `Stored on Aiven · kept ${a.retentionDays} days · ${a.source === "clickhouse" ? "full history on ClickHouse" : "PostgreSQL"}` : "Stored on Aiven"}
            {a && <Badge tone={a.configured ? "green" : "slate"}>{a.configured ? `Last ${a.days} days` : "Not configured"}</Badge>}
          </span>
        }
      />

      {error && <p className="text-sm text-destructive">Could not load your analytics.</p>}
      {isLoading && !d && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}</div>
      )}

      {d && a && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi icon={Activity} label={`Agent actions · ${a.days} days`} value={String(actions)} hint={a.avgAgentSeconds != null ? `answers in ${a.avgAgentSeconds}s on average` : "replies, approvals, desktop, lookups"} />
            <Kpi icon={Clock} label="Remote desktop this month" value={fmtMinutes(desktopMin)} hint={`of ${fmtMinutes(d.plan.quota.desktopMinutes)} · ${d.plan.name}`} />
            <Kpi icon={Sparkles} label="AI tokens this month" value={fmtTokens(d.plan.usage.aiTokens)} hint={`of ${fmtTokens(d.plan.quota.aiTokens)}`} />
            <Kpi
              icon={gap != null && gap > 0 ? TrendingUp : TrendingDown}
              label="Your prices vs market"
              value={gap == null ? "—" : `${gap > 0 ? "+" : ""}${eur(gap)}`}
              hint={d.stock.priced ? `${d.stock.priced} of ${d.stock.listings} listings have a market price` : "Ask for a market price on a listing"}
              tone={gap == null ? undefined : gap > 0 ? "up" : "down"}
            />
          </div>

          <Card className="p-5 space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-muted-foreground" />
                <h2 className="font-medium">What the agent did, day by day</h2>
              </div>
              <div className="flex gap-2 flex-wrap">
                {Object.entries(a.totals).filter(([k]) => !k.startsWith("billing.")).sort((x, y) => y[1] - x[1]).slice(0, 5).map(([k, v]) => (
                  <Badge key={k} tone="slate">{(DAY_KINDS.find((x) => x.key === k)?.label ?? k.replace(/[._]/g, " "))} · {v}</Badge>
                ))}
              </div>
            </div>
            {a.byDay.length === 0 ? (
              <EmptyState icon={<Activity className="w-5 h-5" />} title="No activity yet" text="Ask the agent something in the chat or open the remote desktop — every action lands here within seconds." />
            ) : (
              <ActivityChart byDay={a.byDay} days={a.days} />
            )}
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-5 space-y-4">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-muted-foreground" />
                <h2 className="font-medium">This month on your plan</h2>
                <Badge tone={d.plan.id === "trial" ? "slate" : "amber"}>{d.plan.name}</Badge>
              </div>
              <div>
                <div className="flex justify-between text-sm"><span>Remote desktop</span><span className="tabular-nums text-muted-foreground">{fmtMinutes(desktopMin)} / {fmtMinutes(d.plan.quota.desktopMinutes)}</span></div>
                <Progress value={deskPct} className={cn("mt-1.5 h-1.5", deskPct >= 90 && "[&>div]:bg-destructive")} />
              </div>
              <div>
                <div className="flex justify-between text-sm"><span>AI tokens</span><span className="tabular-nums text-muted-foreground">{fmtTokens(d.plan.usage.aiTokens)} / {fmtTokens(d.plan.quota.aiTokens)}</span></div>
                <Progress value={tokPct} className={cn("mt-1.5 h-1.5", tokPct >= 90 && "[&>div]:bg-destructive")} />
              </div>
              <p className="text-xs text-muted-foreground">
                {d.plan.complimentary ? "Unlimited access included with your account." : d.plan.id === "trial" ? "Your free trial: 30 minutes of remote desktop. " : "Resets on the 1st of each month. "}
                {!d.plan.complimentary && <Link href="/dashboard/plan" className="underline underline-offset-2">See plans</Link>}
              </p>
            </Card>

            <Card className="p-5 space-y-4">
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-muted-foreground" />
                <h2 className="font-medium">Your stock against the market</h2>
              </div>
              <dl className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-xl bg-muted p-3"><dt className="text-xs text-muted-foreground">Asking</dt><dd className="text-lg font-semibold tabular-nums">{eur(d.stock.asking)}</dd></div>
                <div className="rounded-xl bg-muted p-3"><dt className="text-xs text-muted-foreground">Market value</dt><dd className="text-lg font-semibold tabular-nums">{d.stock.priced ? eur(d.stock.marketValue) : "—"}</dd></div>
                <div className="rounded-xl bg-muted p-3"><dt className="text-xs text-muted-foreground">Listings</dt><dd className="text-lg font-semibold tabular-nums">{d.stock.listings}</dd></div>
              </dl>
              <div className="flex gap-2 flex-wrap text-xs">
                <Badge tone={d.stock.overpriced ? "amber" : "slate"}>{d.stock.overpriced} priced above the market</Badge>
                <Badge tone={d.stock.underpriced ? "green" : "slate"}>{d.stock.underpriced} could ask more</Badge>
              </div>
              {d.stock.byMarketplace.length > 0 && (
                <Table>
                  <TableHeader>
                    <TableRow><TableHead>Marketplace</TableHead><TableHead className="text-right">Listings</TableHead><TableHead className="text-right">Asking</TableHead><TableHead className="text-right">Views</TableHead><TableHead className="text-right">Likes</TableHead></TableRow>
                  </TableHeader>
                  <TableBody>
                    {d.stock.byMarketplace.map((m) => (
                      <TableRow key={m.marketplace}>
                        <TableCell className="capitalize"><span className="inline-flex items-center gap-2"><MarketplaceLogo marketplace={m.marketplace} size={20} /> {m.marketplace}</span></TableCell>
                        <TableCell className="text-right tabular-nums">{m.listings}</TableCell>
                        <TableCell className="text-right tabular-nums">{eur(m.asking)}</TableCell>
                        <TableCell className="text-right tabular-nums">{m.views}</TableCell>
                        <TableCell className="text-right tabular-nums">{m.favorites}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Card>
          </div>

          <Card className="p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Search className="w-4 h-4 text-muted-foreground" />
              <h2 className="font-medium">Live market prices you asked for</h2>
              <span className="text-xs text-muted-foreground">median of what buyers pay · every lookup moves the curve</span>
            </div>
            {d.searches.length === 0 ? (
              <EmptyState icon={<Search className="w-5 h-5" />} title="No market lookup yet" text="Ask the agent “what is my Levi's jacket worth?” or press “Market price” on a listing." />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow><TableHead>Item</TableHead><TableHead>Where</TableHead><TableHead className="text-right">Median</TableHead><TableHead className="text-right">Sales</TableHead><TableHead>Trend</TableHead><TableHead className="text-right">Last</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  {d.searches.map((s) => (
                    <TableRow key={`${s.marketplace}:${s.keyword}`}>
                      <TableCell className="font-medium">{s.keyword}</TableCell>
                      <TableCell className="capitalize">{s.marketplace}</TableCell>
                      <TableCell className="text-right tabular-nums">{eur(s.median)}</TableCell>
                      <TableCell className="text-right tabular-nums">{s.n}</TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-2">
                          <Sparkline values={s.series} />
                          {s.trendPct != null && <span className={cn("text-xs tabular-nums", s.trendPct > 0 ? "text-emerald-700" : s.trendPct < 0 ? "text-destructive" : "text-muted-foreground")}>{s.trendPct > 0 ? "+" : ""}{s.trendPct}%</span>}
                        </span>
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">{new Date(s.lastAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>

          {a.byMarketplace.length > 0 && (
            <Card className="p-5 space-y-3">
              <h2 className="font-medium">Agent work per marketplace</h2>
              <Table>
                <TableHeader>
                  <TableRow><TableHead>Marketplace</TableHead><TableHead className="text-right">Replies sent</TableHead><TableHead className="text-right">Decisions</TableHead><TableHead className="text-right">Desktop runs</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  {a.byMarketplace.map((m) => (
                    <TableRow key={m.marketplace}>
                      <TableCell className="capitalize">{m.marketplace}</TableCell>
                      <TableCell className="text-right tabular-nums">{m.repliesSent}</TableCell>
                      <TableCell className="text-right tabular-nums">{m.decisions}</TableCell>
                      <TableCell className="text-right tabular-nums">{m.runs}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
