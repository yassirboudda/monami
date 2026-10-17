"use client"

import { cn } from "@/components/ui"

/** Poulpe, la mascotte : huit bras pour porter toutes les boîtes. */
export function Octopus({ size = 160, className, wave = false }: { size?: number; className?: string; wave?: boolean }) {
  const arms = [
    "M58 112 C 40 130, 30 150, 14 152 C 6 153, 4 146, 10 143",
    "M66 118 C 56 140, 52 162, 38 172 C 31 177, 25 171, 30 166",
    "M76 122 C 74 146, 74 168, 64 182 C 59 189, 52 185, 56 179",
    "M88 124 C 90 148, 94 168, 88 184 C 85 191, 78 189, 80 182",
    "M100 124 C 106 148, 114 166, 112 182 C 111 190, 104 190, 104 183",
    "M110 122 C 122 144, 134 160, 138 176 C 140 184, 133 186, 131 180",
    "M120 118 C 138 134, 152 146, 162 160 C 166 167, 160 171, 156 165",
    "M126 110 C 146 120, 164 124, 178 136 C 184 141, 179 147, 174 142",
  ]
  return (
    <svg
      viewBox="0 0 190 200"
      width={size}
      height={(size * 200) / 190}
      className={cn("overflow-visible", className)}
      role="img"
      aria-label="Poulpe, la mascotte OctoHandy"
    >
      <defs>
        <radialGradient id="octo-body" cx="40%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#FFF8D8" />
          <stop offset="60%" stopColor="#FFEBA0" />
          <stop offset="100%" stopColor="#EED184" />
        </radialGradient>
      </defs>
      <g className="octo-bob">
        <g fill="none" stroke="url(#octo-body)" strokeWidth="13" strokeLinecap="round">
          {arms.map((d, i) => (
            <path
              key={i}
              d={d}
              className="tentacle"
              style={{
                transformOrigin: i < 4 ? "100% 0%" : "0% 0%",
                animationDelay: `${-i * 0.45}s`,
                animationDuration: wave && i === 7 ? "1.2s" : undefined,
              }}
            />
          ))}
        </g>
        <g fill="none" stroke="#E2C27A" strokeWidth="1.2" strokeLinecap="round" opacity="0.7">
          {arms.map((d, i) => (
            <path key={i} d={d} className="tentacle" strokeDasharray="1 7" style={{ transformOrigin: i < 4 ? "100% 0%" : "0% 0%", animationDelay: `${-i * 0.45}s` }} />
          ))}
        </g>
        <path
          d="M95 14 C 140 14, 152 52, 148 80 C 145 104, 128 122, 95 124 C 62 122, 45 104, 42 80 C 38 52, 50 14, 95 14 Z"
          fill="url(#octo-body)"
        />
        <ellipse cx="78" cy="36" rx="16" ry="9" fill="#FFFDF0" opacity="0.6" transform="rotate(-20 78 36)" />
        <g fill="#43302E">
          <ellipse className="octo-eye" cx="78" cy="82" rx="5" ry="6.5" />
          <ellipse className="octo-eye" cx="112" cy="82" rx="5" ry="6.5" />
        </g>
        <ellipse cx="66" cy="96" rx="8" ry="4.5" fill="#F4B9A8" opacity="0.55" />
        <ellipse cx="124" cy="96" rx="8" ry="4.5" fill="#F4B9A8" opacity="0.55" />
        <path d="M89 96 Q 95 102, 101 96" fill="none" stroke="#43302E" strokeWidth="2.4" strokeLinecap="round" />
      </g>
    </svg>
  )
}
