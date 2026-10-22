import type { Range } from "@/data/mock";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { useId } from "react";

export const eur = (n: number) => `${n.toLocaleString("fr-FR")} €`;

export function RangeToggle({ value, onChange }: { value: Range; onChange: (r: Range) => void }) {
  const id = useId();
  return (
    <div className="inline-flex rounded-full bg-muted p-1 text-xs font-medium">
      {(["1M", "6M", "1Y"] as Range[]).map((r) => (
        <button
          key={r}
          onClick={() => onChange(r)}
          className={cn(
            "relative rounded-full px-3 py-1 transition-colors",
            value === r ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {value === r && (
            <motion.span layoutId={id} className="absolute inset-0 rounded-full bg-primary" />
          )}
          <span className="relative">{r}</span>
        </button>
      ))}
    </div>
  );
}

type TipProps = { active?: boolean; payload?: { name: string; value: number; color?: string; dataKey?: string }[]; label?: string; unit?: string };

export function ChartTip({ active, payload, label, unit = "€" }: TipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2 text-xs shadow-lg">
      <div className="mb-1 font-medium text-muted-foreground">{label}</div>
      {payload
        .filter((p) => p.dataKey !== "band")
        .map((p) => (
          <div key={p.name} className="flex items-center gap-2">
            <span className="size-2 rounded-full" style={{ background: p.color }} />
            <span className="text-muted-foreground">{p.name}</span>
            <span className="ml-auto font-semibold text-foreground">
              {Array.isArray(p.value) ? p.value.join("–") : p.value} {unit}
            </span>
          </div>
        ))}
    </div>
  );
}

export function Card({ className, children, title, right }: { className?: string; children: React.ReactNode; title?: string; right?: React.ReactNode }) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn("surface p-4 sm:p-5", className)}
    >
      {(title || right) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
          {right}
        </div>
      )}
      {children}
    </motion.div>
  );
}
