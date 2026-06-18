"use client";

import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import {
  DataTexture,
  RGBAFormat,
  SRGBColorSpace,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
  Group,
} from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

/* ─── Pip layout ────────────────────────────────────────────────────────────── */
const O = 0.62;
const PIP_UV: Record<number, [number, number][]> = {
  1: [[0, 0]],
  2: [[-O, O], [O, -O]],
  3: [[-O, O], [0, 0], [O, -O]],
  4: [[-O, O], [O, O], [-O, -O], [O, -O]],
  5: [[-O, O], [O, O], [0, 0], [-O, -O], [O, -O]],
  6: [[-O, O], [O, O], [-O, 0], [O, 0], [-O, -O], [O, -O]],
};

// RoundedBox/Box face-material order: +X, -X, +Y, -Y, +Z, -Z
const FACE_VALUES = [3, 4, 1, 6, 2, 5];

/* ─── Texture generation ────────────────────────────────────────────────────── */
const TEX = 256;
const PIP_R = TEX * 0.10;
// pip offset scale — without this, ±O maps exactly to texture edges (pixel 0/TEX),
// clipping every corner pip. SCALE pulls centres inward so pips are fully visible.
const PIP_SCALE = 0.68;

function hexToRgb(hex: number) {
  return { r: (hex >> 16) & 0xff, g: (hex >> 8) & 0xff, b: hex & 0xff };
}

function makeFaceTex(value: number, bg: number, pip: number): DataTexture {
  const { r: br, g: bg_, b: bb } = hexToRgb(bg);
  const { r: pr, g: pg, b: pb } = hexToRgb(pip);

  const data = new Uint8Array(TEX * TEX * 4);
  for (let i = 0; i < TEX * TEX; i++) {
    data[i * 4] = br;
    data[i * 4 + 1] = bg_;
    data[i * 4 + 2] = bb;
    data[i * 4 + 3] = 255;
  }

  const uvPips = PIP_UV[value] ?? [[0, 0]];
  for (const [u, v] of uvPips) {
    const cx = (u / (O * 2) * PIP_SCALE + 0.5) * TEX;
    const cy = (1 - (v / (O * 2) * PIP_SCALE + 0.5)) * TEX;
    const rOuter = PIP_R;
    const rInner = PIP_R - 1.5;
    const x0 = Math.max(0, Math.floor(cx - rOuter - 1));
    const x1 = Math.min(TEX - 1, Math.ceil(cx + rOuter + 1));
    const y0 = Math.max(0, Math.floor(cy - rOuter - 1));
    const y1 = Math.min(TEX - 1, Math.ceil(cy + rOuter + 1));

    for (let py = y0; py <= y1; py++) {
      for (let px = x0; px <= x1; px++) {
        const dist = Math.sqrt((px - cx) ** 2 + (py - cy) ** 2);
        if (dist >= rOuter) continue;
        const alpha = dist <= rInner ? 1 : (rOuter - dist) / (rOuter - rInner);
        const idx = (py * TEX + px) * 4;
        data[idx] = Math.round(pr * alpha + br * (1 - alpha));
        data[idx + 1] = Math.round(pg * alpha + bg_ * (1 - alpha));
        data[idx + 2] = Math.round(pb * alpha + bb * (1 - alpha));
        data[idx + 3] = 255;
      }
    }
  }

  const tex = new DataTexture(data, TEX, TEX, RGBAFormat);
  tex.colorSpace = SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

const BG_WHITE = 0xf5f5fa;
const BG_GOLD = 0xfbbf24;
const PIP_DARK = 0x111111;
const PIP_WIN = 0x7c2d12;

function makeMaterials(bgHex: number, pipHex: number): MeshStandardMaterial[] {
  return FACE_VALUES.map(
    (v) =>
      new MeshStandardMaterial({
        map: makeFaceTex(v, bgHex, pipHex),
        roughness: 0.38,
        metalness: 0.06,
      }),
  );
}

/* ─── Orientation helpers ───────────────────────────────────────────────────── */
const UP = new Vector3(0, 1, 0);
const NORMAL: Record<number, Vector3> = {
  1: new Vector3(0, 1, 0),
  6: new Vector3(0, -1, 0),
  2: new Vector3(0, 0, 1),
  5: new Vector3(0, 0, -1),
  3: new Vector3(1, 0, 0),
  4: new Vector3(-1, 0, 0),
};

function targetQuat(value: number): Quaternion {
  const base = new Quaternion().setFromUnitVectors(NORMAL[value], UP);
  const yaw = new Quaternion().setFromAxisAngle(UP, (Math.floor(Math.random() * 4) * Math.PI) / 2);
  return yaw.multiply(base);
}

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const SETTLE = 0.75;

interface Rig {
  quat: Quaternion;
  angVel: Vector3;
  fromQ: Quaternion;
  toQ: Quaternion;
  settling: boolean;
  t: number;
  phase: number;
}
function makeRig(): Rig {
  return {
    quat: new Quaternion(),
    angVel: new Vector3(),
    fromQ: new Quaternion(),
    toQ: new Quaternion(),
    settling: false,
    t: 0,
    phase: Math.random() * Math.PI * 2,
  };
}

/* ─── Dice meshes + animation ───────────────────────────────────────────────── */
function Dice({ rolling, faces, win }: { rolling: boolean; faces: [number, number]; win: boolean }) {
  const g0 = useRef<Group>(null);
  const g1 = useRef<Group>(null);
  const refs = [g0, g1];

  const geo = useMemo(() => new RoundedBoxGeometry(2, 2, 2, 4, 0.18), []);
  const normalMats = useMemo(
    () => [makeMaterials(BG_WHITE, PIP_DARK), makeMaterials(BG_WHITE, PIP_DARK)],
    [],
  );
  const winMats = useMemo(() => [makeMaterials(BG_GOLD, PIP_WIN), makeMaterials(BG_GOLD, PIP_WIN)], []);

  const rigs = useRef<Rig[]>([makeRig(), makeRig()]);
  const prevRolling = useRef(false);
  const rollingRef = useRef(rolling);
  rollingRef.current = rolling;
  const facesRef = useRef(faces);
  facesRef.current = faces;

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const isRolling = rollingRef.current;

    if (isRolling && !prevRolling.current) {
      rigs.current.forEach((d) => {
        d.settling = false;
        d.angVel.set(rand(9, 17), rand(7, 14), rand(9, 17));
        if (Math.random() < 0.5) d.angVel.x *= -1;
        if (Math.random() < 0.5) d.angVel.z *= -1;
      });
    }
    if (!isRolling && prevRolling.current) {
      rigs.current.forEach((d, i) => {
        d.fromQ.copy(d.quat);
        d.toQ.copy(targetQuat(facesRef.current[i] ?? 1));
        d.t = 0;
        d.settling = true;
      });
    }
    prevRolling.current = isRolling;

    const now = performance.now();
    rigs.current.forEach((d, i) => {
      const g = refs[i].current;
      if (!g) return;
      if (isRolling && !d.settling) {
        const speed = d.angVel.length();
        if (speed > 1e-4) {
          const axis = d.angVel.clone().multiplyScalar(1 / speed);
          d.quat.premultiply(new Quaternion().setFromAxisAngle(axis, speed * dt));
        }
        g.position.y = Math.sin(now * 0.011 + d.phase) * 0.3;
      } else if (d.settling) {
        d.t = Math.min(d.t + dt / SETTLE, 1);
        const e = easeOutCubic(d.t);
        d.quat.slerpQuaternions(d.fromQ, d.toQ, e);
        g.position.y = Math.sin(e * Math.PI) * 0.6;
        if (d.t >= 1) d.settling = false;
      } else {
        g.position.y += (0 - g.position.y) * 0.1;
      }
      g.quaternion.copy(d.quat);
    });
  });

  return (
    <>
      <group ref={g0} position={[-1.55, 0, 0]}>
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        <mesh geometry={geo as any} material={(win ? winMats[0] : normalMats[0]) as any} />
      </group>
      <group ref={g1} position={[1.55, 0, 0]}>
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        <mesh geometry={geo as any} material={(win ? winMats[1] : normalMats[1]) as any} />
      </group>
    </>
  );
}

/* ─── Public component ──────────────────────────────────────────────────────── */
interface Dice3DProps {
  rolling: boolean;
  faces: [number, number];
  win: boolean;
  height?: number;
}

export function Dice3D({ rolling, faces, win, height = 160 }: Dice3DProps) {
  return (
    <div style={{ height, width: "100%" }}>
      <Canvas
        gl={{ antialias: true, alpha: true }}
        dpr={[1, 2]}
        camera={{ position: [0, 7.2, 4.6], fov: 40, near: 0.1, far: 100 }}
        onCreated={({ camera }) => camera.lookAt(0, 0, 0)}
      >
        <ambientLight intensity={1.0} />
        <directionalLight position={[2, 8, 5]} intensity={1.2} />
        <directionalLight position={[-4, 3, -2]} intensity={0.4} />
        <directionalLight position={[0, -3, 4]} intensity={0.3} color="#f59e0b" />
        <Dice rolling={rolling} faces={faces} win={win} />
      </Canvas>
    </div>
  );
}
