import { Mascot } from "./monami-brand"

/** Kept for the existing call sites: the former octopus now renders the MonAmi mascot. */
export function Octopus(props: { className?: string; still?: boolean; label?: string }) {
  return <Mascot {...props} />
}
