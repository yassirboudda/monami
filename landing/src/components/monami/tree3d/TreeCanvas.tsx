import { useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { TreeScene, type Bloom } from "./TreeScene";

/*
 * TreeCanvas — the 3D tree background with a cinematic camera that travels
 * along the tree as the user progresses (roots → trunk → branch → canopy →
 * fruit → full). Background is Cool Horizon sky blue.
 */

export type TreeStage = "roots" | "trunk" | "branch" | "canopy" | "fruit" | "full";
export type { Bloom };

const STAGES: Record<TreeStage, { pos: [number, number, number]; look: [number, number, number] }> = {
  roots: { pos: [0, 1.0, 5.4], look: [0, 1.2, 0] },
  trunk: { pos: [0.8, 4.0, 6.4], look: [0, 4.2, 0] },
  branch: { pos: [-3.2, 7.0, 7.0], look: [-1.2, 7.4, 0] },
  canopy: { pos: [0.6, 9.5, 16], look: [0, 9.0, 0] },
  fruit: { pos: [2.6, 9.6, 6.0], look: [1.6, 10.0, 0] },
  full: { pos: [0, 7.5, 22], look: [0, 7.4, 0] },
};

function CameraRig({ stage }: { stage: TreeStage }) {
  const lookTarget = useRef(new THREE.Vector3(...STAGES[stage].look));
  useFrame(({ camera, clock, size }, delta) => {
    const s = STAGES[stage];
    const t = 1 - Math.exp(-2.2 * Math.min(delta, 0.05));
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const sway = reduced ? 0 : Math.sin(clock.elapsedTime * 0.25) * 0.18;
    const distance = stage === "full" ? Math.max(22, 18 / (size.width / size.height)) : s.pos[2];
    camera.position.lerp(new THREE.Vector3(s.pos[0] + sway, s.pos[1], distance), t);
    lookTarget.current.lerp(new THREE.Vector3(...s.look), t);
    camera.lookAt(lookTarget.current);
  });
  return null;
}

export function TreeCanvas({ stage, bloom = "none" }: { stage: TreeStage; bloom?: Bloom }) {
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      <Canvas dpr={[1, 1.5]} camera={{ position: STAGES[stage].pos, fov: 42, near: 0.1, far: 140 }} gl={{ antialias: true, alpha: true }}>
        <TreeScene bloom={bloom} />
        <CameraRig stage={stage} />
      </Canvas>
    </div>
  );
}
