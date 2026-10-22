"use client"

import { useId } from "react"

/** MonAmi brand marks, verbatim from Magra's vector file: the "monami" wordmark and the "m" mascot with two blinking eyes. */

const EYE_L = "M 532.85 194.55 C 535.73 194.55 538.05 192.23 538.05 189.35 C 538.05 186.47 535.73 184.23 532.85 184.23 C 529.97 184.23 527.65 186.47 527.65 189.35 C 527.65 192.23 529.97 194.55 532.85 194.55 Z"
const EYE_R = "M 556.05 194.55 C 558.93 194.55 561.25 192.23 561.25 189.35 C 561.25 186.47 558.93 184.23 556.05 184.23 C 553.17 184.23 550.85 186.47 550.85 189.35 C 550.85 192.23 553.17 194.55 556.05 194.55 Z"
const WORD = [
  "M 561.47 201.26 C 554.03 201.26 548.51 205.26 546.35 211.34 C 544.35 205.26 538.67 201.26 530.83 201.26 C 519.07 201.26 512.83 210.06 512.83 221.02 L 512.83 241.58 L 520.75 241.58 L 520.75 222.22 C 520.75 215.10 524.03 208.86 531.39 208.86 C 538.67 208.86 542.27 214.86 542.27 222.06 L 542.27 241.58 L 550.19 241.58 L 550.19 222.06 C 550.19 214.86 553.79 208.86 560.91 208.86 C 568.27 208.86 571.79 215.10 571.79 222.22 L 571.79 241.58 L 579.71 241.58 L 579.71 220.94 C 579.71 210.06 573.31 201.26 561.47 201.26 Z",
  "M 609.55 242.54 C 621.31 242.54 630.35 233.26 630.35 221.90 C 630.35 210.70 621.39 201.42 609.55 201.42 C 597.79 201.42 588.59 210.62 588.59 221.90 C 588.59 233.26 597.71 242.54 609.55 242.54 Z M 609.55 235.02 C 602.19 235.02 596.51 229.10 596.51 221.98 C 596.51 214.78 602.19 208.86 609.55 208.86 C 616.83 208.86 622.43 214.78 622.43 221.98 C 622.43 229.10 616.83 235.02 609.55 235.02 Z",
  "M 658.67 209.02 C 666.51 209.02 670.51 215.34 670.51 222.70 L 670.51 241.58 L 678.43 241.58 L 678.43 221.74 C 678.43 210.38 671.47 201.42 658.67 201.42 C 646.03 201.42 639.23 210.38 639.23 221.82 L 639.23 241.58 L 647.15 241.58 L 647.15 222.62 C 647.15 215.34 650.99 209.02 658.67 209.02 Z",
  "M 706.99 242.54 C 713.39 242.54 718.59 239.50 721.55 234.70 L 721.55 241.58 L 729.07 241.58 L 729.07 221.90 C 729.07 210.22 720.03 201.42 708.19 201.42 C 696.27 201.42 687.31 210.70 687.31 221.90 C 687.31 233.26 695.63 242.54 706.99 242.54 Z M 708.19 235.02 C 700.91 235.02 695.23 229.10 695.23 221.98 C 695.23 214.78 700.91 208.86 708.19 208.86 C 715.55 208.86 721.15 214.78 721.15 221.98 C 721.15 229.10 715.55 235.02 708.19 235.02 Z",
  "M 789.07 201.26 C 781.63 201.26 776.11 205.26 773.95 211.34 C 771.95 205.26 766.27 201.26 758.43 201.26 C 746.67 201.26 740.43 210.06 740.43 221.02 L 740.43 241.58 L 748.35 241.58 L 748.35 222.22 C 748.35 215.10 751.63 208.86 758.99 208.86 C 766.27 208.86 769.87 214.86 769.87 222.06 L 769.87 241.58 L 777.79 241.58 L 777.79 222.06 C 777.79 214.86 781.39 208.86 788.51 208.86 C 795.87 208.86 799.39 215.10 799.39 222.22 L 799.39 241.58 L 807.31 241.58 L 807.31 220.94 C 807.31 210.06 800.91 201.26 789.07 201.26 Z",
  "M 824.19 194.62 C 827.07 194.62 829.31 192.30 829.31 189.42 C 829.31 186.54 827.07 184.14 824.19 184.14 C 821.31 184.14 818.99 186.54 818.99 189.42 C 818.99 192.30 821.31 194.62 824.19 194.62 Z M 820.27 202.38 L 820.27 241.58 L 828.19 241.58 L 828.19 202.38 L 820.27 202.38 Z",
]

/** The "monami" wordmark. On hover the two dots jump and the letters ripple (see .oh-logo in oh.css). Height follows the font-size of the element (e.g. className="text-[22px]"), color follows currentColor. */
export function MonamiLogo({ className, label = "MonAmi" }: { className?: string; label?: string }) {
  return (
    <svg viewBox="509.8 181.1 322.5 64.4" className={`oh-logo block w-auto overflow-visible ${className ?? ""}`} style={{ height: "1em" }} role="img" aria-label={label}>
      {WORD.map((d, i) => (
        <path key={i} className="oh-logo-letter" style={{ "--i": i } as React.CSSProperties} fill="currentColor" fillRule="evenodd" d={d} />
      ))}
      <path className="oh-eye oh-logo-eye" fill="currentColor" d={EYE_L} />
      <path className="oh-eye oh-logo-eye oh-logo-eye-r" fill="currentColor" d={EYE_R} />
    </svg>
  )
}

const MASCOT_M = "M 576.29 328.10 C 568.85 328.10 563.33 332.10 561.17 338.18 C 559.17 332.10 553.49 328.10 545.65 328.10 C 533.89 328.10 527.65 336.90 527.65 347.86 L 527.65 368.42 L 535.57 368.42 L 535.57 349.06 C 535.57 341.94 538.85 335.70 546.21 335.70 C 553.49 335.70 557.09 341.70 557.09 348.90 L 557.09 368.42 L 565.01 368.42 L 565.01 348.90 C 565.01 341.70 568.61 335.70 575.73 335.70 C 583.09 335.70 586.61 341.94 586.61 349.06 L 586.61 368.42 L 594.53 368.42 L 594.53 347.78 C 594.53 336.90 588.13 328.10 576.29 328.10 Z"
const MASCOT_EYE_L = "M 547.66 321.39 C 550.54 321.39 552.86 319.07 552.86 316.19 C 552.86 313.31 550.54 311.07 547.66 311.07 C 544.78 311.07 542.46 313.31 542.46 316.19 C 542.46 319.07 544.78 321.39 547.66 321.39 Z"
const MASCOT_EYE_R = "M 570.86 321.39 C 573.74 321.39 576.06 319.07 576.06 316.19 C 576.06 313.31 573.74 311.07 570.86 311.07 C 567.98 311.07 565.66 313.31 565.66 316.19 C 565.66 319.07 567.98 321.39 570.86 321.39 Z"

/** The mascot: the "m" with two eyes. It floats and blinks; the drawing itself never changes. */
export function Mascot({ className, still = false, label = "" }: { className?: string; still?: boolean; label?: string }) {
  const id = `oh-metal-${useId().replace(/:/g, "")}`
  return (
    <span className={`oh-octo inline-block ${still ? "" : "oh-float"} ${className ?? ""}`}>
      <svg viewBox="524.6 308.1 72.9 63.4" role={label ? "img" : undefined} aria-label={label || undefined} aria-hidden={label ? undefined : true} className="block w-full h-auto overflow-visible">
        <defs>
          {/* Magra's "metal bordeaux" fill, same stops as the landing's Mascot.tsx */}
          <linearGradient id={id} x1="0" y1="0" x2="1" y2=".7">
            <stop offset="0" stopColor="var(--tree-leaf)" />
            <stop offset=".3" stopColor="var(--tree-leaf-light)" />
            <stop offset=".4" stopColor="var(--metal-bright)" />
            <stop offset=".5" stopColor="var(--tree-leaf-light)" />
            <stop offset=".7" stopColor="var(--tree-leaf)" />
            <stop offset=".86" stopColor="var(--metal-mid)" />
            <stop offset="1" stopColor="var(--tree-leaf)" />
          </linearGradient>
        </defs>
        <g fill={`url(#${id})`} stroke="var(--mascot-outline)" strokeWidth=".45">
          <path d={MASCOT_M} />
          <path className="oh-eye" d={MASCOT_EYE_L} />
          <path className="oh-eye" d={MASCOT_EYE_R} />
        </g>
      </svg>
    </span>
  )
}

/** The mascot speaking: Magra's onboarding pattern — the "m" on the left, a rounded speech bubble on the right. */
export function MascotSay({ children, big = false, className = "" }: { children: React.ReactNode; big?: boolean; className?: string }) {
  return (
    <div className={`flex items-end gap-4 ${className}`}>
      <Mascot className={`shrink-0 ${big ? "w-20 sm:w-24" : "w-14 sm:w-16"}`} />
      <div className="oh-bubble relative rounded-3xl rounded-bl-md bg-card px-5 py-4 text-base font-medium shadow-sm sm:text-lg">{children}</div>
    </div>
  )
}
