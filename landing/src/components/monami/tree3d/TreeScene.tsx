import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

/*
 * Abstract ink tree: black vector strokes (no shading), white outlined leaves when the user sells,
 * white outlined fruits when the user buys. Deterministic (seeded rng) so every render is identical.
 */
export type Bloom = "none" | "leaves" | "fruits" | "both";

function rng(seed: number) {
  let s = seed % 2147483647;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

type Stroke = { points: THREE.Vector3[]; width: number };

function grow(from: THREE.Vector3, dir: THREE.Vector3, len: number, width: number, depth: number, r: () => number, out: Stroke[], tips: THREE.Vector3[]) {
  const pts: THREE.Vector3[] = [from.clone()];
  const d = dir.clone().normalize();
  let p = from.clone();
  for (let i = 1; i <= 6; i++) {
    d.x += (r() - 0.5) * 0.18; d.z += (r() - 0.5) * 0.18; d.y += 0.04; d.normalize();
    p = p.clone().addScaledVector(d, len / 6);
    pts.push(p);
  }
  out.push({ points: pts, width });
  if (depth === 0 || width < 0.012) { tips.push(p); return; }
  const n = depth > 3 ? 2 : 2 + Math.floor(r() * 2);
  for (let k = 0; k < n; k++) {
    const axis = new THREE.Vector3(r() - 0.5, 0.2, r() - 0.5).normalize();
    const nd = d.clone().applyAxisAngle(axis, (0.55 + r() * 0.5) * (k % 2 === 0 ? 1 : -1)).normalize();
    grow(pts[Math.min(6, 3 + Math.floor(r() * 3))]!, nd, len * (0.62 + r() * 0.18), width * 0.62, depth - 1, r, out, tips);
  }
}

function strokeGeometry(s: Stroke) {
  const curve = new THREE.CatmullRomCurve3(s.points);
  const tubular = s.points.length * 3;
  const geo = new THREE.TubeGeometry(curve, tubular, 1, 5, false);
  const pos = geo.attributes["position"] as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i <= tubular; i++) {
    const w = s.width * (1 - (i / tubular) * 0.7);
    const spine = curve.getPoint(i / tubular);
    for (let j = 0; j <= 5; j++) {
      const idx = i * 6 + j;
      v.set(pos.getX(idx), pos.getY(idx), pos.getZ(idx)).sub(spine).multiplyScalar(w).add(spine);
      pos.setXYZ(idx, v.x, v.y, v.z);
    }
  }
  return geo;
}

function build() {
  const r = rng(11);
  const strokes: Stroke[] = [];
  const tips: THREE.Vector3[] = [];
  grow(new THREE.Vector3(0, -0.3, 0), new THREE.Vector3(0.02, 1, 0), 9.5, 0.26, 5, r, strokes, tips);
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2 + r() * 0.4;
    grow(new THREE.Vector3(0, 0, 0), new THREE.Vector3(Math.cos(a), -0.7 - r() * 0.3, Math.sin(a)), 2 + r() * 1.4, 0.1, 1, r, strokes, []);
  }
  return { strokes, tips };
}

export function TreeScene({ bloom = "none" }: { bloom?: Bloom }) {
  const group = useRef<THREE.Group>(null);
  const { strokes, tips } = useMemo(() => build(), []);
  const geos = useMemo(() => strokes.map(strokeGeometry), [strokes]);
  const ink = useMemo(() => new THREE.MeshBasicMaterial({ color: "#1a1412" }), []);
  const white = useMemo(() => new THREE.LineBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.9 }), []);
  const leafGeo = useMemo(() => {
    const pts = new THREE.EllipseCurve(0, 0, 1, 0.5, 0, Math.PI * 2, false, 0).getPoints(24);
    return new THREE.BufferGeometry().setFromPoints(pts.map((p) => new THREE.Vector3(p.x, p.y, 0)));
  }, []);
  const fruitGeo = useMemo(() => {
    const pts = new THREE.EllipseCurve(0, 0, 1, 1, 0, Math.PI * 2, false, 0).getPoints(24);
    return new THREE.BufferGeometry().setFromPoints(pts.map((p) => new THREE.Vector3(p.x, p.y, 0)));
  }, []);
  const items = useMemo(() => {
    const r = rng(23);
    return tips.flatMap((t) => Array.from({ length: 2 + Math.floor(r() * 3) }, () => ({
      pos: t.clone().add(new THREE.Vector3((r() - 0.5) * 2.4, (r() - 0.3) * 1.6, (r() - 0.5) * 2.4)),
      rot: new THREE.Euler(r() * Math.PI, r() * Math.PI, r() * Math.PI),
      s: 0.3 + r() * 0.4,
    })));
  }, [tips]);
  const scale = useRef(0);

  useFrame(({ clock }, delta) => {
    if (!group.current) return;
    group.current.rotation.y = clock.elapsedTime * 0.04;
    group.current.rotation.z = Math.sin(clock.elapsedTime * 0.4) * 0.006;
    const goal = bloom === "none" ? 0 : 1;
    scale.current += (goal - scale.current) * (1 - Math.exp(-3 * Math.min(delta, 0.05)));
    group.current.children.forEach((c) => { if (c.userData["bloom"]) c.scale.setScalar(Math.max(0.0001, c.userData["s"] * scale.current)); });
  });

  const showLeaves = bloom === "leaves" || bloom === "both";
  const showFruits = bloom === "fruits" || bloom === "both";
  return (
    <group ref={group}>
      {geos.map((g, i) => <mesh key={i} geometry={g} material={ink} />)}
      {items.map((l, i) => (
        <lineLoop key={`b${i}`} geometry={showFruits && (!showLeaves || i % 2 === 0) ? fruitGeo : leafGeo} material={white} position={l.pos} rotation={l.rot} scale={0.0001} userData={{ bloom: true, s: l.s }} visible={showLeaves || showFruits} />
      ))}
      <lineLoop geometry={leafGeo} material={white} position={[0, -0.35, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[4.5, 4.5, 1]} />
    </group>
  );
}
