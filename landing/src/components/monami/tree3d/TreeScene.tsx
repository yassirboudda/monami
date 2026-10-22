import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/*
 * Procedural stylized ("Pixar-like") tree:
 *   bark   — polished silver, smooth shading, recursive branching
 *   leaves — Night Bordeaux, real leaf shapes (shown when the user sells)
 *   fruits — glossy bordeaux berries with stems (shown when the user buys)
 * Deterministic (seeded rng) so every render is identical.
 */

export type Bloom = "none" | "leaves" | "fruits" | "both";

function rng(seed: number) {
  let s = seed % 2147483647;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

type Tip = { p: THREE.Vector3; d: THREE.Vector3 };

function palette() {
  const css = getComputedStyle(document.documentElement);
  return { silver: css.getPropertyValue("--tree-silver").trim(), leaf: css.getPropertyValue("--tree-leaf").trim(), light: css.getPropertyValue("--tree-leaf-light").trim(), fruit: css.getPropertyValue("--tree-fruit").trim(), stem: css.getPropertyValue("--tree-stem").trim() };
}

function tube(points: THREE.Vector3[], r0: number, r1: number, tubular: number, radial: number) {
  const curve = new THREE.CatmullRomCurve3(points);
  const geo = new THREE.TubeGeometry(curve, tubular, 1, radial, false);
  const pos = geo.attributes["position"] as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i <= tubular; i++) {
    const t = i / tubular;
    // ease the taper + flare at the base for an organic, sculpted feel
    const r = r1 + (r0 - r1) * Math.pow(1 - t, 1.4) + (t < 0.12 ? (0.12 - t) * r0 * 1.6 : 0);
    const spine = curve.getPoint(t);
    for (let j = 0; j <= radial; j++) {
      const idx = i * (radial + 1) + j;
      v.set(pos.getX(idx), pos.getY(idx), pos.getZ(idx)).sub(spine).multiplyScalar(r).add(spine);
      pos.setXYZ(idx, v.x, v.y, v.z);
    }
  }
  geo.computeVertexNormals();
  return geo;
}

type Spec = { points: [number, number, number][]; r0: number; r1: number; root?: boolean };

// Hand-tuned winding skeleton (the original tree), echoing the design reference.
const BRANCHES: Spec[] = [
  { points: [[0, -0.3, 0], [-0.35, 1.6, 0.15], [0.4, 3.2, -0.1], [-0.15, 4.8, 0.2], [0.3, 6.4, 0], [0, 8, 0.1], [0.15, 9.4, 0]], r0: 0.6, r1: 0.16 },
  { points: [[0.05, 5.6, 0.05], [-1.4, 6.3, 0.3], [-2.9, 6.9, 0.1], [-4.2, 7.9, -0.2], [-5.1, 9.2, 0]], r0: 0.26, r1: 0.05 },
  { points: [[-2.9, 6.9, 0.1], [-3.6, 7.6, 0.7], [-4.0, 8.6, 0.9]], r0: 0.13, r1: 0.04 },
  { points: [[0.2, 7.2, 0], [1.7, 7.9, -0.2], [3.2, 8.5, 0.1], [4.4, 9.6, 0.3], [5.2, 10.9, 0.1]], r0: 0.24, r1: 0.05 },
  { points: [[3.2, 8.5, 0.1], [3.9, 9.2, -0.6], [4.3, 10.3, -0.8]], r0: 0.12, r1: 0.04 },
  { points: [[0.15, 9.4, 0], [-0.7, 10.4, 0.2], [-1.5, 11.1, 0.1]], r0: 0.11, r1: 0.03 },
  { points: [[0.15, 9.4, 0], [1.0, 10.5, -0.1], [1.9, 11.3, 0.1]], r0: 0.11, r1: 0.03 },
  { points: [[0.15, 9.4, 0], [0.1, 10.7, 0.3], [0.0, 11.9, 0.2]], r0: 0.1, r1: 0.03 },
  { points: [[0, 0.25, 0], [-0.9, -0.05, 0.3], [-2.1, -0.25, 0.5]], r0: 0.32, r1: 0.05, root: true },
  { points: [[0, 0.25, 0], [1.0, -0.05, -0.2], [2.3, -0.25, -0.4]], r0: 0.3, r1: 0.05, root: true },
  { points: [[0, 0.25, 0], [0.2, -0.15, 0.9], [0.4, -0.3, 1.9]], r0: 0.26, r1: 0.05, root: true },
  { points: [[0, 0.25, 0], [-0.3, -0.15, -0.8], [-0.7, -0.3, -1.8]], r0: 0.24, r1: 0.05, root: true },
  { points: [[0, 0.2, 0], [0.8, -0.1, 0.8], [1.6, -0.3, 1.3]], r0: 0.18, r1: 0.04, root: true },
];

function buildTree() {
  const r = rng(7);
  const geos: THREE.BufferGeometry[] = [];
  const tips: Tip[] = [];

  BRANCHES.forEach((b, bi) => {
    const pts = b.points.map((p) => new THREE.Vector3(...p));
    const big = b.r0 > 0.2;
    geos.push(tube(pts, b.r0, b.r1, big ? 64 : 32, big ? 24 : 14));
    if (b.root) return;
    const curve = new THREE.CatmullRomCurve3(pts);
    const end = curve.getPoint(1);
    tips.push({ p: end, d: curve.getTangent(1) });
    if (bi === 0) return;
    // Pixar detail: little curling twigs sprouting along each branch
    const n = big ? 7 : 4;
    for (let k = 0; k < n; k++) {
      const t = 0.35 + (k / n) * 0.6 + r() * 0.05;
      const from = curve.getPoint(t);
      const tan = curve.getTangent(t);
      const side = new THREE.Vector3((r() - 0.5) * 2, 0.6 + r() * 0.6, (r() - 0.5) * 2).normalize();
      const d = tan.clone().lerp(side, 0.65).normalize();
      const len = (big ? 1.3 : 0.8) * (0.7 + r() * 0.5);
      const p1 = from.clone().addScaledVector(d, len * 0.5);
      const p2 = p1.clone().addScaledVector(d.clone().add(new THREE.Vector3((r() - 0.5) * 0.6, 0.35, (r() - 0.5) * 0.6)).normalize(), len * 0.5);
      geos.push(tube([from, p1, p2], b.r0 * 0.38, 0.009, 20, 8));
      tips.push({ p: p2, d });
      const twig = new THREE.CatmullRomCurve3([from, p1, p2]);
      for (let j = 1; j <= 5; j++) {
        const anchor = twig.getPoint(j / 6);
        const axis = new THREE.Vector3(j % 2 ? -.6 : .6, .25, (r()-.5)*.8);
        const leafBase = anchor.clone().addScaledVector(axis, .2);
        geos.push(tube([anchor, leafBase], .012, .004, 6, 5));
        tips.push({ p: leafBase, d: axis.normalize() });
      }
    }
  });

  // keep per-tube smooth normals (recomputing after merge would facet the seams)
  const bark = mergeGeometries(geos, false);
  geos.forEach((g) => g.dispose());
  if (!bark) throw new Error("Tree geometry could not be merged");
  return { bark, tips };
}

function leafGeometry() {
  const vertices: number[] = [], uvs: number[] = [], indices: number[] = [];
  const rows = 10, cols = 4;
  for (let y = 0; y <= rows; y++) {
    const t = y / rows;
    const width = Math.pow(Math.sin(Math.PI * t), .85) * .18;
    for (let x = 0; x <= cols; x++) {
      const across = x / cols * 2 - 1;
      vertices.push(across * width, t * .64, Math.sin(t*Math.PI)*.07 - Math.abs(across)*.07 + Math.sin(t*12)*Math.abs(across)*.008);
      uvs.push(x / cols, t);
      if (y < rows && x < cols) { const i = y * (cols+1)+x; indices.push(i,i+1,i+cols+1,i+1,i+cols+2,i+cols+1); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(vertices,3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs,2));
  g.setIndex(indices); g.computeVertexNormals();
  return g;
}

function veinTexture() {
  const canvas = document.createElement("canvas"); canvas.width = 128; canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (!ctx) return undefined;
  ctx.fillStyle = "#808080"; ctx.fillRect(0,0,128,256);
  ctx.strokeStyle = "#c8c8c8"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(64,256); ctx.lineTo(64,0); ctx.stroke();
  ctx.lineWidth = 1;
  for (let y=25; y<240; y+=25) { ctx.beginPath(); ctx.moveTo(64,y+28); ctx.lineTo(8,y); ctx.moveTo(64,y+28);ctx.lineTo(120,y);ctx.stroke(); }
  return new THREE.CanvasTexture(canvas);
}

function useGrowth(target: boolean) {
  const g = useRef(target ? 1 : 0);
  return { g, target };
}

function Instanced({ geometry, material, matrices, colors, visible }: { geometry: THREE.BufferGeometry; material: THREE.Material; matrices: THREE.Matrix4[]; colors?: THREE.Color[]; visible: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const { g } = useGrowth(visible);
  const tmp = useMemo(() => ({ p: new THREE.Vector3(), q: new THREE.Quaternion(), s: new THREE.Vector3(), m: new THREE.Matrix4() }), []);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh || !colors) return;
    colors.forEach((c, i) => mesh.setColorAt(i, c));
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [colors]);

  useFrame((_, delta) => {
    const mesh = ref.current;
    if (!mesh) return;
    const goal = visible ? 1 : 0;
    if (Math.abs(g.current - goal) < 0.001 && mesh.userData["init"]) return;
    g.current += (goal - g.current) * (1 - Math.exp(-3 * Math.min(delta, 0.05)));
    mesh.userData["init"] = true;
    matrices.forEach((m, i) => {
      // staggered pop-in: each instance grows in its own window
      const local = THREE.MathUtils.clamp(g.current * 1.6 - (i / matrices.length) * 0.6, 0, 1);
      const e = 1 - Math.pow(1 - local, 3);
      m.decompose(tmp.p, tmp.q, tmp.s);
      tmp.s.multiplyScalar(e);
      tmp.m.compose(tmp.p, tmp.q, tmp.s);
      mesh.setMatrixAt(i, tmp.m);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.visible = g.current > 0.002;
  });

  return <instancedMesh ref={ref} args={[geometry, material, matrices.length]} frustumCulled={false} />;
}

// Melancholic yellowed grass that half-covers the roots so the tree sits on the ground.
function Grass() {
  const data = useMemo(() => {
    const r = rng(31);
    const blade = new THREE.PlaneGeometry(0.05, 1, 1, 4);
    const pos = blade.attributes["position"] as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) + 0.5;
      pos.setXYZ(i, pos.getX(i) * (1 - y * 0.92), y, y * y * 0.18);
    }
    blade.computeVertexNormals();
    const shades = ["#c9b06a", "#b49a52", "#d8c487", "#9c8a4c", "#a8925f"].map((c) => new THREE.Color(c));
    const m: THREE.Matrix4[] = [], c: THREE.Color[] = [];
    for (let i = 0; i < 2600; i++) {
      const rad = Math.pow(r(), 0.6) * 4.2, a = r() * Math.PI * 2;
      const h = (0.3 + r() * 0.5) * (1.15 - rad / 6);
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler((r() - 0.5) * 0.5, r() * Math.PI * 2, (r() - 0.5) * 0.5));
      m.push(new THREE.Matrix4().compose(new THREE.Vector3(Math.cos(a) * rad, -0.08, Math.sin(a) * rad), q, new THREE.Vector3(1, h, 1)));
      c.push((shades[i % shades.length] ?? new THREE.Color("#c9b06a")).clone().multiplyScalar(0.85 + r() * 0.3));
    }
    return { blade, m, c, mat: new THREE.MeshStandardMaterial({ roughness: 0.85, side: THREE.DoubleSide }), ground: new THREE.CircleGeometry(4.6, 48) };
  }, []);
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    data.m.forEach((mm, i) => { mesh.setMatrixAt(i, mm); mesh.setColorAt(i, data.c[i] ?? new THREE.Color()); });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [data]);
  useEffect(() => () => { data.blade.dispose(); data.mat.dispose(); data.ground.dispose(); }, [data]);
  return (
    <group>
      <mesh geometry={data.ground} rotation-x={-Math.PI / 2} position-y={-0.06}>
        <meshStandardMaterial color="#8f7d47" roughness={1} transparent opacity={0.9} />
      </mesh>
      <instancedMesh ref={ref} args={[data.blade, data.mat, data.m.length]} frustumCulled={false} />
    </group>
  );
}

export function TreeScene({ bloom = "none" }: { bloom?: Bloom }) {
  const data = useMemo(() => {
    const { bark, tips } = buildTree();
    const r = rng(99);

    const leafGeo = leafGeometry();
    const leafM: THREE.Matrix4[] = [];
    const leafC: THREE.Color[] = [];
    const colors = palette();
    const shades = [colors.leaf, colors.light].map((c) => new THREE.Color(c));
    const fruitM: THREE.Matrix4[] = [], stemM: THREE.Matrix4[] = [];
    const stemGeo = new THREE.CylinderGeometry(.009,.013,1,6);
    tips.forEach((t, i) => {
      // Leaves start exactly at a petiole, rather than scattered in a cloud.
      for (let k = 0; k < 2; k++) {
        const d = t.d.clone().add(new THREE.Vector3(k ? .4 : -.4,.25,(r()-.5)*.7)).normalize();
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0), d);
        q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),(r()-.5)*1.2));
        const size = .8 + r()*.55;
        leafM.push(new THREE.Matrix4().compose(t.p,q,new THREE.Vector3(size,size,size)));
        leafC.push((shades[i % shades.length] ?? new THREE.Color(colors.leaf)).clone());
      }
      if (i % 3 !== 0) return;
      // Three berries share a twig attachment, like the supplied reference.
      for (let k=0; k<3; k++) {
        const fruit = t.p.clone().add(new THREE.Vector3((k-1)*.18,-.18-r()*.14,(r()-.5)*.16));
        const delta = fruit.clone().sub(t.p), length = delta.length();
        const mid = t.p.clone().add(fruit).multiplyScalar(.5);
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());
        stemM.push(new THREE.Matrix4().compose(mid,q,new THREE.Vector3(1,length,1)));
        const size = .75+r()*.35;
        fruitM.push(new THREE.Matrix4().compose(fruit,new THREE.Quaternion(),new THREE.Vector3(size,size*.94,size)));
      }
    });

    return {
      bark,
      leafGeo,
      leafM,
      leafC,
      fruitM,
      stemM,
      fruitGeo: new THREE.SphereGeometry(0.15, 14, 10),
      stemGeo,
      colors,
      veins: veinTexture(),
      leafMat: new THREE.MeshPhysicalMaterial({ roughness: .42, side: THREE.DoubleSide, clearcoat: .35, sheen: .3 }),
      fruitMat: new THREE.MeshPhysicalMaterial({ color: colors.fruit, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.15, sheen: 0.4 }),
      stemMat: new THREE.MeshStandardMaterial({ color: colors.stem, roughness: 0.7 }),
    };
  }, []);

  useEffect(() => {
    data.leafMat.bumpMap = data.veins ?? null; data.leafMat.bumpScale = .025; data.leafMat.needsUpdate = true;
    return () => { data.bark.dispose(); data.leafGeo.dispose(); data.fruitGeo.dispose(); data.stemGeo.dispose(); data.leafMat.dispose(); data.fruitMat.dispose(); data.stemMat.dispose(); data.veins?.dispose(); };
  }, [data]);
  const leaves = bloom !== "none";
  const fruits = bloom === "fruits" || bloom === "both";

  return (
    <group>
      <Grass />
      <mesh geometry={data.bark}>
        <meshPhysicalMaterial color={data.colors.silver} metalness={0.8} roughness={0.26} clearcoat={0.6} clearcoatRoughness={0.25} />
      </mesh>

      <Instanced geometry={data.leafGeo} material={data.leafMat} matrices={data.leafM} colors={data.leafC} visible={leaves} />
      <Instanced geometry={data.fruitGeo} material={data.fruitMat} matrices={data.fruitM} visible={fruits} />
      <Instanced geometry={data.stemGeo} material={data.stemMat} matrices={data.stemM} visible={fruits} />
    </group>
  );
}
