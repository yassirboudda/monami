"use client"

import { AnimatePresence, motion } from "framer-motion"
import { Loader2, X } from "lucide-react"
import { forwardRef, useEffect } from "react"
import { twMerge } from "tailwind-merge"
import { siEbay, siEtsy, siFacebook, siVinted } from "simple-icons"

export const cn = (...c: (string | false | null | undefined)[]) => twMerge(c.filter(Boolean).join(" "))

type BtnVariant = "primary" | "secondary" | "ghost" | "danger" | "blue"
const btnBase =
  "inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-all duration-200 disabled:opacity-55 select-none"
const btnVariants: Record<BtnVariant, string> = {
  primary: "bg-primary text-primary-foreground hover:opacity-90 px-4 py-2.5 shadow-[0_1px_2px_rgba(67,48,46,0.2)]",
  blue: "bg-primary text-primary-foreground hover:opacity-90 px-4 py-2.5",
  secondary: "bg-card border border-border hover:bg-accent px-4 py-2.5 text-foreground shadow-[0_1px_2px_rgba(67,48,46,0.06)]",
  ghost: "px-3 py-2 text-muted-foreground hover:text-foreground hover:bg-accent",
  danger: "px-4 py-2.5 text-red-600 bg-red-50 hover:bg-red-100 border border-red-200/70",
}

export const Button = forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; loading?: boolean; size?: "sm" | "md" }
>(function Button({ variant = "primary", loading, size = "md", className, children, disabled, ...rest }, ref) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(btnBase, btnVariants[variant], size === "sm" && "px-3 py-1.5 text-xs rounded-lg", className)}
      {...rest}
    >
      {loading && <Loader2 className="w-4 h-4 animate-spin" />}
      {children}
    </button>
  )
})

export function Card({ className, children, interactive, ...rest }: React.HTMLAttributes<HTMLDivElement> & { interactive?: boolean }) {
  return (
    <div className={cn("bg-card border border-border rounded-xl shadow-[0_1px_2px_rgba(67,48,46,0.06)]", interactive && "cursor-pointer hover:bg-accent/40 transition-colors", className)} {...rest}>
      {children}
    </div>
  )
}

export function Panel({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("glass-panel rounded-2xl", className)} {...rest}>
      {children}
    </div>
  )
}

export function PageHeader({
  label,
  title,
  subtitle,
  actions,
}: {
  label?: string
  title: string
  subtitle?: React.ReactNode
  actions?: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between mb-6">
      <div className="min-w-0">
        {label && <p className="text-label mb-1.5">{label}</p>}
        <h1 className="text-title">{title}</h1>
        {subtitle && <p className="text-body-muted mt-1 max-w-2xl">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
    </div>
  )
}

const tones = {
  green: "bg-[#e3f1ea] text-emerald-700 border-[#bfe0cf]/70",
  red: "bg-red-50 text-red-700 border-red-200/70",
  amber: "bg-butter text-foreground border-[#efd96a]/70",
  blue: "bg-sky/40 text-foreground border-sky/70",
  slate: "bg-muted text-muted-foreground border-border",
  teal: "bg-sky/40 text-foreground border-sky/70",
}
export type Tone = keyof typeof tones

export function Badge({ tone = "slate", children, className }: { tone?: Tone; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium", tones[tone], className)}>
      {children}
    </span>
  )
}

export function StatusDot({ tone, live }: { tone: "green" | "red" | "amber" | "slate" | "blue"; live?: boolean }) {
  const color = { green: "#10b981", red: "#ef4444", amber: "#f59e0b", slate: "#94a3b8", blue: "#2563eb" }[tone]
  return <span className={cn("status-dot", live && "live")} style={{ background: color, color }} />
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("shimmer rounded-xl", className)} />
}

export function EmptyState({
  icon,
  title,
  text,
  action,
}: {
  icon: React.ReactNode
  title: string
  text?: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center text-center px-6 py-12">
      <div className="w-14 h-14 rounded-2xl glass-panel flex items-center justify-center text-secondary mb-4">{icon}</div>
      <p className="font-semibold">{title}</p>
      {text && <p className="text-caption mt-1 max-w-sm">{text}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  wide?: boolean
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose()
    window.addEventListener("keydown", onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      window.removeEventListener("keydown", onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center p-0 sm:p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-primary/40 backdrop-blur-sm" onClick={onClose} />
          <motion.div
            role="dialog"
            aria-modal
            className={cn("modal-panel relative w-full rounded-t-3xl sm:rounded-2xl max-h-[92dvh] overflow-y-auto", wide ? "sm:max-w-3xl" : "sm:max-w-lg")}
            initial={{ y: 40, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 30, opacity: 0, scale: 0.98 }}
            transition={{ type: "spring", damping: 28, stiffness: 320 }}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 px-5 py-4 border-b border-border bg-white/95 backdrop-blur">
              <h3 className="font-semibold">{title}</h3>
              <button onClick={onClose} className="w-9 h-9 rounded-xl hover:bg-muted/60 flex items-center justify-center" aria-label="Fermer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn("relative w-11 h-6 rounded-full transition-colors duration-200 shrink-0", checked ? "bg-[#0f172a]" : "bg-slate-300")}
    >
      <motion.span
        layout
        transition={{ type: "spring", stiffness: 500, damping: 32 }}
        className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow"
        style={{ left: checked ? 22 : 2 }}
      />
    </button>
  )
}

export function Field({ label, hint, children }: { label: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium mb-1.5">{label}</span>
      {children}
      {hint && <span className="block text-caption mt-1">{hint}</span>}
    </label>
  )
}

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cn("glass-input w-full rounded-xl px-3.5 py-2.5 text-sm placeholder:text-muted-foreground", className)} {...rest} />
})

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, ...rest },
  ref
) {
  return <textarea ref={ref} className={cn("glass-input w-full rounded-xl px-3.5 py-2.5 text-sm placeholder:text-muted-foreground resize-y min-h-24", className)} {...rest} />
})

export function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string; count?: number }[]
}) {
  return (
    <div className="inline-flex p-1 rounded-xl bg-muted/60 border border-border gap-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "relative px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
            value === o.value ? "text-foreground" : "text-muted-foreground hover:text-foreground"
          )}
        >
          {value === o.value && (
            <motion.span layoutId={`seg-${options.map((x) => x.value).join("")}`} className="absolute inset-0 bg-white rounded-lg shadow-sm" transition={{ type: "spring", stiffness: 500, damping: 36 }} />
          )}
          <span className="relative">
            {o.label}
            {o.count !== undefined && <span className="ml-1.5 text-xs text-muted-foreground">{o.count}</span>}
          </span>
        </button>
      ))}
    </div>
  )
}

const BRAND_ICONS: Record<string, { path: string; hex: string }> = {
  vinted: { path: siVinted.path, hex: siVinted.hex },
  ebay: { path: siEbay.path, hex: siEbay.hex },
  etsy: { path: siEtsy.path, hex: siEtsy.hex },
  facebook_marketplace: { path: siFacebook.path, hex: siFacebook.hex },
  facebook: { path: siFacebook.path, hex: siFacebook.hex },
}
const BRAND_DOMAINS: Record<string, string> = {
  leboncoin: "leboncoin.fr",
  depop: "depop.com",
  wallapop: "wallapop.com",
  vestiaire: "vestiairecollective.com",
  vestiairecollective: "vestiairecollective.com",
  amazon: "amazon.fr",
  zalando: "zalando.fr",
  farfetch: "farfetch.com",
}

/** Real brand mark: simple-icons SVG when available, otherwise the site's own favicon. */
export function MarketplaceLogo({ marketplace, size = 36 }: { marketplace: string; size?: number }) {
  const key = marketplace.toLowerCase()
  const icon = BRAND_ICONS[key]
  const box = "rounded-xl flex items-center justify-center shrink-0 border border-border bg-white shadow-[0_1px_2px_rgba(67,48,46,0.08)] overflow-hidden"
  if (icon) {
    return (
      <span className={box} style={{ width: size, height: size }} aria-label={marketplace}>
        <svg viewBox="0 0 24 24" width={size * 0.6} height={size * 0.6} role="img" aria-hidden>
          <path d={icon.path} fill={`#${icon.hex}`} />
        </svg>
      </span>
    )
  }
  const domain = BRAND_DOMAINS[key]
  if (domain) {
    return (
      <span className={box} style={{ width: size, height: size }} aria-label={marketplace}>
        <img src={`https://icons.duckduckgo.com/ip3/${domain}.ico`} alt={marketplace} width={size * 0.62} height={size * 0.62} className="object-contain" loading="lazy" />
      </span>
    )
  }
  const initial = marketplace.replace(/[^a-z0-9]/gi, "").charAt(0).toUpperCase() || "M"
  return (
    <span className={cn(box, "font-bold text-foreground bg-butter")} style={{ width: size, height: size }}>
      {initial}
    </span>
  )
}

export function FadeIn({ children, delay = 0, className }: { children: React.ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  )
}

/* ---------- Added with the warm design (designer PR #12 parity) ---------- */

export function Switch({ checked, onCheckedChange, disabled, label, className }: { checked: boolean; onCheckedChange: (v: boolean) => void; disabled?: boolean; label?: string; className?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-10 shrink-0 items-center rounded-full border transition-colors disabled:opacity-50",
        checked ? "bg-primary border-primary" : "bg-muted border-input",
        className
      )}
    >
      <span className={cn("inline-block h-5 w-5 rounded-full shadow-sm transition-transform", checked ? "translate-x-[18px] bg-butter" : "translate-x-[1px] bg-card")} />
    </button>
  )
}

export function Checkbox({ checked, onCheckedChange, disabled, className, id }: { checked: boolean; onCheckedChange: (v: boolean) => void; disabled?: boolean; className?: string; id?: string }) {
  return (
    <button
      type="button"
      role="checkbox"
      id={id}
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn("inline-flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded border transition-colors disabled:opacity-50", checked ? "bg-primary border-primary text-butter" : "bg-card border-input", className)}
    >
      {checked && <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 6.5l2.5 2.5L10 3.5" /></svg>}
    </button>
  )
}

export function Alert({ variant = "default", children, className }: { variant?: "default" | "destructive" | "info"; children: React.ReactNode; className?: string }) {
  return (
    <div
      role="alert"
      className={cn(
        "rounded-lg border px-4 py-3 text-sm",
        variant === "destructive" && "border-destructive/30 bg-[#fdeceb] text-destructive",
        variant === "info" && "border-sky bg-sky/30 text-foreground",
        variant === "default" && "border-border bg-card text-foreground",
        className
      )}
    >
      {children}
    </div>
  )
}

export function Progress({ value, className }: { value: number; className?: string }) {
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-muted", className)} role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  )
}

export function SegmentedControl<T extends string>({ value, onChange, options, className, size = "sm" }: { value: T; onChange: (v: T) => void; options: { value: T; label: React.ReactNode }[]; className?: string; size?: "sm" | "md" }) {
  return (
    <div role="group" className={cn("inline-flex rounded-lg border border-border bg-card p-0.5", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn("rounded-md font-medium transition-colors", size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm", o.value === value ? "bg-butter text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground")}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Table({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("w-full overflow-x-auto rounded-xl border border-border bg-card", className)}>
      <table className="w-full text-sm">{children}</table>
    </div>
  )
}
export function THead({ children }: { children: React.ReactNode }) {
  return <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">{children}</thead>
}
export function TBody({ children }: { children: React.ReactNode }) {
  return <tbody className="divide-y divide-border">{children}</tbody>
}
export function TR({ children, className, ...rest }: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn("hover:bg-accent/40 transition-colors", className)} {...rest}>{children}</tr>
}
export function TH({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <th className={cn("px-4 py-2.5 font-medium", className)}>{children}</th>
}
export function TD({ children, className, ...rest }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("px-4 py-3 align-middle", className)} {...rest}>{children}</td>
}
