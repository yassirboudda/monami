"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Canvas, useFrame, useThree } from "@react-three/fiber"
import * as THREE from "three"

/*
 * MonAmi tree — an abstract, vector-looking tree drawn only with ink lines on paper:
 * no shading, no texture, just strokes. Deterministic (seeded) so every render is identical.
 * The camera rides along the trunk as the page scrolls: roots → trunk → branches → canopy.
 */

function rng(seed: number) {
  let s = seed % 2147483647
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
}

type Stroke = { points: THREE.Vector3[]; width: number }

function grow(from: THREE.Vector3, dir: THREE.Vector3, len: number, width: number, depth: number, r: () => number, out: Stroke[], tips: THREE.Vector3[]) {
  const pts: THREE.Vector3[] = [from.clone()]
  const d = dir.clone().normalize()
  const segs = 6
  let p = from.clone()
  for (let i = 1; i <= segs; i++) {
    d.x += (r() - 0.5) * 0.18
    d.z += (r() - 0.5) * 0.18
    d.y += 0.04 // branches reach for the light
    d.normalize()
    p = p.clone().addScaledVector(d, len / segs)
    pts.push(p)
  }
  out.push({ points: pts, width })
  if (depth === 0 || width < 0.006) {
    tips.push(p)
    return
  }
  const n = depth > 3 ? 2 : 2 + Math.floor(r() * 2)
  for (let k = 0; k < n; k++) {
    const spread = 0.55 + r() * 0.5
    const axis = new THREE.Vector3(r() - 0.5, 0.2, r() - 0.5).normalize()
    const nd = d.clone().applyAxisAngle(axis, spread * (k % 2 === 0 ? 1 : -1)).normalize()
    const at = pts[Math.min(segs, 3 + Math.floor(r() * 3))]
    grow(at, nd, len * (0.62 + r() * 0.18), width * 0.62, depth - 1, r, out, tips)
  }
}

function buildTree() {
  const r = rng(11)
  const strokes: Stroke[] = []
  const tips: THREE.Vector3[] = []
  // trunk
  grow(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.02, 1, 0), 4.6, 0.1, 5, r, strokes, tips)
  // roots: mirrored, thinner, dive down
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2 + r() * 0.4
    const dir = new THREE.Vector3(Math.cos(a), -0.7 - r() * 0.3, Math.sin(a))
    grow(new THREE.Vector3(0, 0.1, 0), dir, 1.0 + r() * 0.7, 0.045, 1, r, strokes, [])
  }
  return { strokes, tips }
}

/** A stroke is a thin flat ribbon facing the camera-ish (drawn as a tube with very few sides so it stays "vector"). */
function strokeGeometry(s: Stroke) {
  const curve = new THREE.CatmullRomCurve3(s.points)
  const geo = new THREE.TubeGeometry(curve, s.points.length * 3, 1, 5, false)
  const pos = geo.attributes["position"] as THREE.BufferAttribute
  const v = new THREE.Vector3()
  const tubular = s.points.length * 3
  for (let i = 0; i <= tubular; i++) {
    const t = i / tubular
    const w = s.width * (1 - t * 0.7)
    const spine = curve.getPoint(t)
    for (let j = 0; j <= 5; j++) {
      const idx = i * 6 + j
      v.set(pos.getX(idx), pos.getY(idx), pos.getZ(idx)).sub(spine).multiplyScalar(w).add(spine)
      pos.setXYZ(idx, v.x, v.y, v.z)
    }
  }
  return geo
}

function Tree({ ink }: { ink: string }) {
  const group = useRef<THREE.Group>(null)
  const { strokes, tips } = useMemo(() => buildTree(), [])
  const geos = useMemo(() => strokes.map(strokeGeometry), [strokes])
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: ink, transparent: true, opacity: 0.82 }), [ink])
  const ringMat = useMemo(() => new THREE.LineBasicMaterial({ color: ink, transparent: true, opacity: 0.75 }), [ink])
  // leaves: small outlined rings scattered around the tips, like a draftsman's shorthand for foliage
  const leaves = useMemo(() => {
    const r = rng(23)
    const circle = new THREE.EllipseCurve(0, 0, 1, 0.55, 0, Math.PI * 2, false, 0).getPoints(24)
    const geo = new THREE.BufferGeometry().setFromPoints(circle.map((p) => new THREE.Vector3(p.x, p.y, 0)))
    const items: { pos: THREE.Vector3; rot: THREE.Euler; s: number }[] = []
    tips.forEach((t) => {
      const n = 2 + Math.floor(r() * 3)
      for (let k = 0; k < n; k++) {
        items.push({
          pos: t.clone().add(new THREE.Vector3((r() - 0.5) * 1.4, (r() - 0.3) * 1.0, (r() - 0.5) * 1.4)),
          rot: new THREE.Euler(r() * Math.PI, r() * Math.PI, r() * Math.PI),
          s: 0.22 + r() * 0.26,
        })
      }
    })
    return { geo, items }
  }, [tips])

  useFrame(({ clock }) => {
    if (!group.current) return
    group.current.rotation.y = clock.elapsedTime * 0.04
    group.current.rotation.z = Math.sin(clock.elapsedTime * 0.4) * 0.006 // a breath of wind
  })

  return (
    <group ref={group}>
      {geos.map((g, i) => (
        <mesh key={i} geometry={g} material={mat} />
      ))}
      {leaves.items.map((l, i) => (
        <lineLoop key={`l${i}`} geometry={leaves.geo} material={ringMat} position={l.pos} rotation={l.rot} scale={l.s} />
      ))}
      {/* ground line: a single ellipse under the roots */}
      <lineLoop geometry={leaves.geo} material={ringMat} position={[0, -0.05, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[2.6, 2.6, 1]} />
    </group>
  )
}

/** Camera path: progress 0 = among the roots, 1 = up in the canopy looking down the trunk. */
const PATH = [
  { pos: new THREE.Vector3(0, -0.4, 14), look: new THREE.Vector3(0, 1.2, 0) },
  { pos: new THREE.Vector3(3, 2.6, 12), look: new THREE.Vector3(0, 3.2, 0) },
  { pos: new THREE.Vector3(-4, 5.4, 10), look: new THREE.Vector3(0, 5.6, 0) },
  { pos: new THREE.Vector3(1.5, 8.2, 8), look: new THREE.Vector3(0, 7, 0) },
  { pos: new THREE.Vector3(0, 12, 5), look: new THREE.Vector3(0, 6.5, 0) },
]
const posCurve = new THREE.CatmullRomCurve3(PATH.map((p) => p.pos))
const lookCurve = new THREE.CatmullRomCurve3(PATH.map((p) => p.look))

function CameraRig({ progress }: { progress: React.MutableRefObject<number> }) {
  const { camera } = useThree()
  const look = useRef(new THREE.Vector3())
  const t = useRef(0)
  useFrame((_, delta) => {
    t.current += (progress.current - t.current) * (1 - Math.exp(-3 * Math.min(delta, 0.05)))
    const p = posCurve.getPoint(t.current)
    camera.position.lerp(p, 0.35)
    look.current.lerp(lookCurve.getPoint(t.current), 0.35)
    camera.lookAt(look.current)
  })
  return null
}

export function TreeScene({ progress, ink = "#3f302b" }: { progress: React.MutableRefObject<number>; ink?: string }) {
  // client-only component (dynamic ssr:false), so matchMedia is safe in the initializer
  const [reduced] = useState(() => matchMedia("(prefers-reduced-motion: reduce)").matches)
  return (
    <Canvas dpr={[1, 1.5]} frameloop={reduced ? "demand" : "always"} camera={{ position: PATH[0].pos.toArray(), fov: 38, near: 0.1, far: 60 }} gl={{ antialias: true, alpha: true }}>
      <Tree ink={ink} />
      <CameraRig progress={progress} />
    </Canvas>
  )
}

/** Reads the page scroll into a 0..1 ref (no re-render per scroll). */
export function useScrollProgress() {
  const progress = useRef(0)
  useEffect(() => {
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - innerHeight
      progress.current = max > 0 ? Math.min(1, Math.max(0, scrollY / max)) : 0
    }
    onScroll()
    addEventListener("scroll", onScroll, { passive: true })
    addEventListener("resize", onScroll)
    return () => {
      removeEventListener("scroll", onScroll)
      removeEventListener("resize", onScroll)
    }
  }, [])
  return progress
}
