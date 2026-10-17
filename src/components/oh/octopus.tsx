import { cn } from "@/components/ui"
import { OCTOPUS_PATHS, OCTOPUS_VIEWBOX } from "./octopus-art"

/** Magra's octopus. It only floats and blinks; the drawing itself is never changed. */
export function Octopus({ className, still = false, label = "OctoHandy" }: { className?: string; still?: boolean; label?: string }) {
  return (
    <span className={cn("oh-octo inline-block", !still && "oh-float", className)}>
      <svg viewBox={OCTOPUS_VIEWBOX} role="img" aria-label={label} className="block w-full h-auto overflow-visible" dangerouslySetInnerHTML={{ __html: OCTOPUS_PATHS }} />
    </span>
  )
}
