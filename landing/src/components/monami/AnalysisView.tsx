import { useState } from "react";
import { motion } from "framer-motion";
import { Area, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, PolarAngleAxis, RadialBar, RadialBarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Check, Clock, Search, ShoppingBag, X } from "lucide-react";
import { analysis as A, marketplaces, series, type Range } from "@/data/mock";
import { copy } from "@/lib/copy";
import { Card, ChartTip, RangeToggle, eur } from "./charts";
import { ProductThumb } from "./ProductDetail";
import { Mascot } from "./Mascot";

function Kpi({ icon: Icon, label, value }: { icon: typeof Search; label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-muted p-3">
      <Icon className="size-4 text-primary" />
      <div className="mt-2 text-lg font-semibold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

export function AnalysisView({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  const [range, setRange] = useState<Range>("6M");
  const hist = series("analysis", 48, range, 0.15).map((d) => ({ ...d, band: [d.min, d.max] }));
  const [lo, hi] = A.bounds;
  const pct = (v: number) => ((v - lo) / (hi - lo)) * 100;

  return (
    <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -30 }} className="mx-auto w-full max-w-6xl space-y-4 pb-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <ProductThumb src={A.image} alt={A.name} className="size-14 rounded-2xl" />
          <Mascot className="absolute -right-4 -top-4 w-8 text-accent" />
        </div>
        <div>
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{copy.analysis}</div>
          <h2 className="text-xl font-semibold sm:text-2xl">{A.name}</h2>
        </div>
        <div className="ml-auto flex gap-2">
          <button onClick={onCancel} className="inline-flex items-center gap-1.5 rounded-full bg-card px-4 py-2 text-sm font-medium shadow-sm hover:bg-muted">
            <X className="size-4" /> {copy.cancel}
          </button>
          <button onClick={onConfirm} className="inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground shadow-md transition hover:brightness-105">
            <Check className="size-4" /> {copy.confirm}
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card title={copy.demand}>
          <div className="flex items-center gap-3">
            <div className="relative size-32 shrink-0">
              <ResponsiveContainer>
                <RadialBarChart innerRadius="72%" outerRadius="100%" data={[{ v: A.demandScore }]} startAngle={220} endAngle={-40}>
                  <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
                  <RadialBar dataKey="v" cornerRadius={20} fill="var(--primary)" background={{ fill: "var(--muted)" }} />
                </RadialBarChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 grid place-items-center text-center">
                <div>
                  <div className="text-3xl font-semibold">{A.demandScore}</div>
                  <div className="text-[10px] text-muted-foreground">/100</div>
                </div>
              </div>
            </div>
            <div className="grid flex-1 gap-2">
              <Kpi icon={Search} label={copy.searches} value={A.searches.toLocaleString("fr-FR")} />
              <Kpi icon={ShoppingBag} label={copy.salesPeriod} value={String(A.sales)} />
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2 rounded-xl bg-success-soft px-3 py-2 text-sm text-success">
            <Clock className="size-4" /> {copy.sellThrough} : ~{A.sellThroughDays} {copy.days}
          </div>
        </Card>

        <Card title={copy.recommended} className="md:col-span-2">
          <div className="text-3xl font-semibold">
            {A.range[0]}–{A.range[1]} €
          </div>
          <div className="relative mt-6 h-3 rounded-full bg-muted">
            <motion.div
              className="absolute inset-y-0 rounded-full bg-brand"
              initial={{ width: 0 }}
              animate={{ left: `${pct(A.range[0])}%`, width: `${pct(A.range[1]) - pct(A.range[0])}%` }}
              transition={{ duration: 0.8 }}
            />
            <motion.div initial={{ left: "0%" }} animate={{ left: `${pct(A.userPrice)}%` }} transition={{ duration: 1, delay: 0.3 }} className="absolute -top-7 -translate-x-1/2 text-center">
              <div className="rounded-md bg-accent px-1.5 py-0.5 text-xs font-semibold text-accent-foreground">
                {copy.yourPrice} {A.userPrice} €
              </div>
              <div className="mx-auto h-8 w-0.5 bg-accent" />
            </motion.div>
          </div>
          <div className="mt-2 flex justify-between text-xs text-muted-foreground">
            <span>{lo} €</span>
            <span>{hi} €</span>
          </div>
          <div className="mt-4 text-xs font-medium text-muted-foreground">{copy.byCondition}</div>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {A.conditions.map((c, i) => (
              <motion.div key={c.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 + i * 0.08 }} className="rounded-xl border border-border p-2.5">
                <div className="text-xs text-muted-foreground">{c.label}</div>
                <div className="text-base font-semibold">{eur(c.price)}</div>
                <div className="mt-1.5 h-1.5 rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${(c.price / 74) * 100}%` }} />
                </div>
              </motion.div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card title={copy.history} right={<RangeToggle value={range} onChange={setRange} />} className="md:col-span-2">
          <div className="h-60">
            <ResponsiveContainer>
              <ComposedChart data={hist}>
                <defs>
                  <linearGradient id="hband" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--primary-glow)" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="var(--primary-glow)" stopOpacity={0.04} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="4 4" />
                <XAxis dataKey="t" tickLine={false} axisLine={false} fontSize={11} stroke="var(--muted-foreground)" />
                <YAxis tickLine={false} axisLine={false} fontSize={11} stroke="var(--muted-foreground)" width={36} domain={["auto", "auto"]} />
                <Tooltip content={<ChartTip />} />
                <Area dataKey="band" name="Min–max" stroke="none" fill="url(#hband)" />
                <Line type="monotone" dataKey="value" name={copy.median} stroke="var(--primary)" strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title={copy.supply}>
          <div className="text-2xl font-semibold">
            {A.supply.count.toLocaleString("fr-FR")} <span className="text-sm font-normal text-muted-foreground">{copy.activeListings}</span>
          </div>
          <div className="mt-2 h-44">
            <ResponsiveContainer>
              <BarChart data={A.supply.buckets}>
                <XAxis dataKey="b" tickLine={false} axisLine={false} fontSize={10} stroke="var(--muted-foreground)" />
                <Tooltip content={<ChartTip unit="" />} cursor={{ fill: "var(--muted)" }} />
                <Bar dataKey="n" name="Annonces" radius={[6, 6, 0, 0]}>
                  {A.supply.buckets.map((b) => (
                    <Cell key={b.b} fill={b.b === "40-50" || b.b === "50-60" ? "var(--primary)" : "var(--secondary)"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card title={copy.platforms}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {A.platforms.map((p, i) => {
            const m = marketplaces[p.id]!;
            return (
              <motion.div key={p.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }} className="rounded-2xl border border-border p-3">
                <div className="flex items-center gap-2">
                  <span className="size-3 rounded-full" style={{ background: m.color }} />
                  <span className="font-semibold">{m.name}</span>
                  {i === 1 && <span className="ml-auto rounded-full bg-success-soft px-2 py-0.5 text-[10px] font-medium text-success">+ rapide</span>}
                </div>
                <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                  <span>{p.count} annonces</span>
                  <span>
                    {copy.median} <b className="text-foreground">{eur(p.median)}</b>
                  </span>
                </div>
                <button className="mt-3 w-full rounded-full bg-primary py-1.5 text-xs font-medium text-primary-foreground transition hover:bg-primary/90">
                  {copy.postOn} {m.name}
                </button>
              </motion.div>
            );
          })}
        </div>
      </Card>
    </motion.div>
  );
}
