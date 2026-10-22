import { cn } from "@/lib/utils";
import { useId } from "react";

// The monami mascot: the "m" mark with two dot eyes, from the brand's vector file.
export function Mascot({ className, float = false }: { className?: string; float?: boolean }) {
  const id = `metal-${useId().replace(/:/g, "")}`;
  return (
    <svg viewBox="524.6 308.1 72.9 63.4" className={cn(float && "mascot-float", className)} aria-hidden>
      <defs>
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
      <path
        d="M 576.29 328.10 C 568.85 328.10 563.33 332.10 561.17 338.18 C 559.17 332.10 553.49 328.10 545.65 328.10 C 533.89 328.10 527.65 336.90 527.65 347.86 L 527.65 368.42 L 535.57 368.42 L 535.57 349.06 C 535.57 341.94 538.85 335.70 546.21 335.70 C 553.49 335.70 557.09 341.70 557.09 348.90 L 557.09 368.42 L 565.01 368.42 L 565.01 348.90 C 565.01 341.70 568.61 335.70 575.73 335.70 C 583.09 335.70 586.61 341.94 586.61 349.06 L 586.61 368.42 L 594.53 368.42 L 594.53 347.78 C 594.53 336.90 588.13 328.10 576.29 328.10 Z"
      />
      <path
        className="mascot-eye"
        d="M 547.66 321.39 C 550.54 321.39 552.86 319.07 552.86 316.19 C 552.86 313.31 550.54 311.07 547.66 311.07 C 544.78 311.07 542.46 313.31 542.46 316.19 C 542.46 319.07 544.78 321.39 547.66 321.39 Z"
      />
      <path
        className="mascot-eye"
        d="M 570.86 321.39 C 573.74 321.39 576.06 319.07 576.06 316.19 C 576.06 313.31 573.74 311.07 570.86 311.07 C 567.98 311.07 565.66 313.31 565.66 316.19 C 565.66 319.07 567.98 321.39 570.86 321.39 Z"
      />
      </g>
    </svg>
  );
}
