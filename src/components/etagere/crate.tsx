"use client"

import type { CSSProperties, ReactNode } from "react"
import { cn } from "@/components/ui"

type CrateProps = {
  open?: boolean
  width?: number
  height?: number
  depth?: number
  label?: ReactNode
  /** Rendered above the box, visible when it opens (items popping out). */
  contents?: ReactNode
  onClick?: () => void
  ariaLabel?: string
  className?: string
  wobble?: number
  showShadow?: boolean
}

export function Crate({
  open = false,
  width = 150,
  height = 110,
  depth = 110,
  label,
  contents,
  onClick,
  ariaLabel,
  className,
  wobble,
  showShadow = true,
}: CrateProps) {
  const style = { "--w": `${width}px`, "--h": `${height}px`, "--d": `${depth}px` } as CSSProperties
  const box = (
    <span className="crate-scene relative inline-block" style={{ width, height }}>
      {contents ? (
        <span
          className={cn(
            "absolute left-1/2 bottom-[60%] -translate-x-1/2 z-10 pointer-events-none transition-all duration-500",
            open ? "opacity-100 -translate-y-6" : "opacity-0 translate-y-6"
          )}
          style={{ transitionTimingFunction: "cubic-bezier(0.34, 1.5, 0.5, 1)" }}
          aria-hidden={!open}
        >
          {contents}
        </span>
      ) : null}
      <span className="crate block" data-open={open} style={style}>
        <span className="crate-face crate-back" />
        <span className="crate-face crate-left" />
        <span className="crate-hole" />
        <span className="crate-face crate-right" />
        <span className="crate-face crate-front">{label ? <span className="crate-label">{label}</span> : null}</span>
        <span className="crate-lid">
          <span className="crate-flap crate-flap-back" />
          <span className="crate-flap crate-flap-front" />
        </span>
      </span>
      {showShadow ? <span className="crate-shadow" /> : null}
    </span>
  )

  const wrapped = wobble ? (
    <span className="wobble inline-block" style={{ "--wobble": `${wobble}deg` } as CSSProperties}>
      {box}
    </span>
  ) : (
    box
  )

  if (!onClick) return <span className={cn("inline-block", className)}>{wrapped}</span>
  return (
    <button type="button" className={cn("crate-hit", className)} onClick={onClick} aria-label={ariaLabel} aria-pressed={open}>
      {wrapped}
    </button>
  )
}
