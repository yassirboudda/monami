"use client"

import { Check, ChevronDown } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { cn } from "@/components/ui"

export function FilterMenu<V extends string | number>({
  label,
  options,
  selected,
  onToggle,
  single = false,
}: {
  label: string
  options: { value: V; label: string }[]
  selected: V[]
  onToggle: (v: V) => void
  single?: boolean
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", close)
    document.addEventListener("keydown", close)
    return () => {
      document.removeEventListener("mousedown", close)
      document.removeEventListener("keydown", close)
    }
  }, [open])

  const active = selected.length > 0
  return (
    <div ref={ref} className="relative">
      <button type="button" className={cn("oh-chip", active && "oh-chip-on")} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {label}
        {active && !single ? <span className="oh-chip-count">{selected.length}</span> : null}
        <ChevronDown size={15} className={cn("transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="oh-menu absolute left-0 top-full mt-2 z-30 min-w-48 p-1.5" role="listbox" aria-multiselectable={!single}>
          {options.map((o) => {
            const on = selected.includes(o.value)
            return (
              <button
                key={String(o.value)}
                type="button"
                role="option"
                aria-selected={on}
                className="oh-menu-item"
                onClick={() => {
                  onToggle(o.value)
                  if (single) setOpen(false)
                }}
              >
                <span className={cn("oh-check", on && "on")}>{on ? <Check size={13} strokeWidth={3} /> : null}</span>
                {o.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
