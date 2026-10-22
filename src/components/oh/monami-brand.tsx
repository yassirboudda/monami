/** MonAmi brand marks (from Magra's vector file): the "monami" wordmark and the "m" mascot with two blinking eyes. */
const M = "C -7.44 0 -12.96 4 -15.12 10.08 C -17.12 4 -22.8 0 -30.64 0 C -42.4 0 -48.64 8.8 -48.64 19.76 L -48.64 40.32 L -40.72 40.32 L -40.72 20.96 C -40.72 13.84 -37.44 7.6 -30.08 7.6 C -22.8 7.6 -19.2 13.6 -19.2 20.8 L -19.2 40.32 L -11.28 40.32 L -11.28 20.8 C -11.28 13.6 -7.68 7.6 -0.56 7.6 C 6.8 7.6 10.32 13.84 10.32 20.96 L 10.32 40.32 L 18.24 40.32 L 18.24 19.68 C 18.24 8.8 11.84 0 0 0 Z"
const O = "M 0 41.28 C 11.76 41.28 20.8 32 20.8 20.64 C 20.8 9.44 11.84 0.16 0 0.16 C -11.76 0.16 -20.96 9.36 -20.96 20.64 C -20.96 32 -11.84 41.28 0 41.28 Z M 0 33.76 C -7.36 33.76 -13.04 27.84 -13.04 20.72 C -13.04 13.52 -7.36 7.6 0 7.6 C 7.28 7.6 12.88 13.52 12.88 20.72 C 12.88 27.84 7.28 33.76 0 33.76 Z"
const N = "M 0 7.76 C 7.84 7.76 11.84 14.08 11.84 21.44 L 11.84 40.32 L 19.76 40.32 L 19.76 20.48 C 19.76 9.12 12.8 0.16 0 0.16 C -12.64 0.16 -19.44 9.12 -19.44 20.56 L -19.44 40.32 L -11.52 40.32 L -11.52 21.36 C -11.52 14.08 -7.68 7.76 0 7.76 Z"
const A = "M -1.2 41.28 C 5.2 41.28 10.4 38.24 13.36 33.44 L 13.36 40.32 L 20.88 40.32 L 20.88 20.64 C 20.88 8.96 11.84 0.16 0 0.16 C -11.92 0.16 -20.88 9.44 -20.88 20.64 C -20.88 32 -12.56 41.28 -1.2 41.28 Z M 0 33.76 C -7.28 33.76 -12.96 27.84 -12.96 20.72 C -12.96 13.52 -7.28 7.6 0 7.6 C 7.36 7.6 12.96 13.52 12.96 20.72 C 12.96 27.84 7.36 33.76 0 33.76 Z"
const I = "M 0 -6.64 C 2.88 -6.64 5.12 -8.96 5.12 -11.84 C 5.12 -14.72 2.88 -17.12 0 -17.12 C -2.88 -17.12 -5.2 -14.72 -5.2 -11.84 C -5.2 -8.96 -2.88 -6.64 0 -6.64 Z M -3.92 1.12 L -3.92 40.32 L 4 40.32 L 4 1.12 L -3.92 1.12 Z"
const EYE = "M 0 0 C 2.88 0 5.2 -2.32 5.2 -5.2 C 5.2 -8.08 2.88 -10.32 0 -10.32 C -2.88 -10.32 -5.2 -8.08 -5.2 -5.2 C -5.2 -2.32 -2.88 0 0 0 Z"
const Eyes = ({ x, y }: { x: number; y: number }) => (
  <>
    <path className="oh-eye" fill="currentColor" transform={`translate(${x - 11.6} ${y - 6.7})`} d={EYE} />
    <path className="oh-eye" fill="currentColor" transform={`translate(${x + 11.6} ${y - 6.7})`} d={EYE} />
  </>
)

/** The "monami" wordmark. Height follows the className (e.g. h-5); color follows currentColor. */
export function MonamiLogo({ className, label = "MonAmi" }: { className?: string; label?: string }) {
  return (
    <svg viewBox="0 -20 302 64" className={`block ${className ?? ""}`} role="img" aria-label={label} style={{ height: "1em" }}>
      <path fill="currentColor" transform="translate(36.6 0)" d={`M 0 0 ${M}`} />
      <Eyes x={36.6} y={0} />
      <path fill="currentColor" fillRule="evenodd" transform="translate(99.8 0)" d={O} />
      <path fill="currentColor" transform="translate(148.9 0)" d={N} />
      <path fill="currentColor" fillRule="evenodd" transform="translate(198.4 0)" d={A} />
      <path fill="currentColor" transform="translate(264.4 0)" d={`M 0 0 ${M}`} />
      <path fill="currentColor" fillRule="evenodd" transform="translate(302 0)" d={I} />
    </svg>
  )
}

/** The mascot: the "m" with two eyes. It floats and blinks; the drawing itself never changes. */
export function Mascot({ className, still = false, label = "" }: { className?: string; still?: boolean; label?: string }) {
  return (
    <span className={`oh-octo inline-block ${still ? "" : "oh-float"} ${className ?? ""}`}>
      <svg viewBox="-52 -22 104 66" role={label ? "img" : undefined} aria-label={label || undefined} aria-hidden={label ? undefined : true} className="block w-full h-auto overflow-visible">
        <path fill="currentColor" d={`M 0 0 ${M}`} />
        <Eyes x={0} y={0} />
      </svg>
    </span>
  )
}
