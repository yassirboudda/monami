"use client"

import dynamic from "next/dynamic"
import { useScrollProgress } from "./tree-scene"

// WebGL is browser-only: the scene never renders on the server.
const TreeScene = dynamic(() => import("./tree-scene").then((m) => m.TreeScene), { ssr: false })

/** Full-page ink tree behind the public pages; the camera climbs it as the user scrolls. Dimmed on phones so the copy stays readable. */
export function TreeBackground({ className = "" }: { className?: string }) {
  const progress = useScrollProgress()
  return (
    <div className={`pointer-events-none fixed inset-0 z-0 opacity-40 sm:opacity-100 ${className}`} aria-hidden>
      <TreeScene progress={progress} />
      {/* paper vignette so text stays readable over the strokes */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_30%,var(--background)_85%)]" />
    </div>
  )
}
