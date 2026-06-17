"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { latLngToVec3, type Venue } from "@/lib/venue";

const GLOBE_R = 2;
const GREEN = "#3C7A1E";
const GREEN_HI = "#5B9E2E";
const YELLOW = "#C7E04A";
const LAND_MASK = "/venue/earth-land.png";

/* ── Dotted continents (dots placed only on land via the mask) ─────────────── */
// Soft circular sprite so each point renders as a round dot (not a square).
function makeDotTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.6, "rgba(255,255,255,1)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(32, 32, 32, 0, Math.PI * 2);
  ctx.fill();
  const tex = new THREE.CanvasTexture(c);
  return tex;
}

function DotGlobe() {
  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null);
  const dotTex = useMemo(makeDotTexture, []);
  const matRef = useRef<THREE.PointsMaterial | null>(null);

  // Shrink dots as camera zooms in so they stay crisp rather than blobbing out.
  useFrame((state) => {
    if (!matRef.current) return;
    const z = state.camera.position.z;
    const t = THREE.MathUtils.clamp((z - 2.7) / (7.6 - 2.7), 0, 1);
    matRef.current.size = THREE.MathUtils.lerp(0.009, 0.026, t);
  });

  useEffect(() => {
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = LAND_MASK;
    img.onload = () => {
      const cw = img.width, ch = img.height;
      const canvas = document.createElement("canvas");
      canvas.width = cw; canvas.height = ch;
      const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, cw, ch).data;

      const isMobile = typeof window !== "undefined" && window.innerWidth < 640;
      const CANDIDATES = isMobile ? 16000 : 30000;
      const pos: number[] = [];
      const col: number[] = [];
      const green = new THREE.Color(GREEN);
      const greenHi = new THREE.Color(GREEN_HI);
      const yellow = new THREE.Color(YELLOW);
      const golden = Math.PI * (3 - Math.sqrt(5)); // Fibonacci sphere

      for (let i = 0; i < CANDIDATES; i++) {
        const y = 1 - (i / (CANDIDATES - 1)) * 2;
        const r = Math.sqrt(1 - y * y);
        const theta = golden * i;
        const x = Math.cos(theta) * r;
        const z = Math.sin(theta) * r;

        const u = Math.atan2(z, -x) / (2 * Math.PI);
        const v = Math.acos(THREE.MathUtils.clamp(y, -1, 1)) / Math.PI;
        const px = Math.min(cw - 1, Math.max(0, Math.floor((((u % 1) + 1) % 1) * cw)));
        const py = Math.min(ch - 1, Math.max(0, Math.floor(v * ch)));
        if (data[(py * cw + px) * 4] <= 128) continue; // mask: land = white

        pos.push(x * GLOBE_R, y * GLOBE_R, z * GLOBE_R);
        const roll = Math.random();
        const c = roll > 0.9 ? yellow : roll > 0.62 ? greenHi : green;
        col.push(c.r, c.g, c.b);
      }

      if (cancelled) return;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(pos), 3));
      geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(col), 3));
      setGeometry(geo);
    };
    return () => { cancelled = true; };
  }, []);

  if (!geometry) return null;
  return (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <points geometry={geometry as any}>
      <pointsMaterial
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ref={matRef as any}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        map={dotTex as any}
        size={0.026}
        vertexColors
        sizeAttenuation
        transparent
        alphaTest={0.45}
        depthWrite={false}
      />
    </points>
  );
}

/* ── Scene: zoom from space (continents) toward the country ────────────────── */
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function Scene({ venue, active, onProgress }: { venue: Venue; active: boolean; onProgress: (p: number) => void }) {
  const progress = useRef(0);
  const elapsed = useRef(0);

  // Orient the globe so the venue faces +Z (toward camera), then dolly straight in.
  const globeQuat = useMemo(() => {
    const v = latLngToVec3(venue.lat, venue.lng, 1);
    const dir = new THREE.Vector3(v[0], v[1], v[2]).normalize();
    return new THREE.Quaternion()
      .setFromUnitVectors(dir, new THREE.Vector3(0, 0, 1))
      .toArray() as [number, number, number, number];
  }, [venue]);

  // Far = whole Earth (continents). Near = tight on the country, just before handoff.
  const camFar: [number, number, number] = [0, 0, 7.6];
  const camNear: [number, number, number] = [0, 0, 2.7];

  useFrame((state, delta) => {
    if (active) elapsed.current += delta;
    const holdDone = elapsed.current > 0.7; // appreciate the whole Earth first
    const target = active && holdDone ? 1 : 0;
    progress.current = THREE.MathUtils.damp(progress.current, target, 1.6, delta);
    const p = progress.current;
    const e = p * p * (3 - 2 * p);

    state.camera.position.set(
      lerp(camFar[0], camNear[0], e),
      lerp(camFar[1], camNear[1], e),
      lerp(camFar[2], camNear[2], e),
    );
    state.camera.lookAt(0, 0, 0);
    onProgress(p);
  });

  return (
    <>
      <ambientLight intensity={0.85} />
      <directionalLight position={[3, 4, 6]} intensity={1.2} />
      <directionalLight position={[-4, 1, -2]} intensity={0.35} color={YELLOW} />

      <group quaternion={globeQuat}>
        {/* Invisible depth sphere: only the near hemisphere of dots shows. */}
        <mesh>
          <sphereGeometry args={[GLOBE_R * 0.97, 48, 48]} />
          <meshBasicMaterial colorWrite={false} />
        </mesh>
        <DotGlobe />
      </group>
    </>
  );
}

/* ── Public component — the dotted-globe intro ─────────────────────────────── */
export function VenueGlobe({ venue, active, onProgress }: { venue: Venue; active: boolean; onProgress?: (p: number) => void }) {
  return (
    <Canvas camera={{ position: [0, 0, 7.6], fov: 45 }} gl={{ antialias: true, alpha: true }} dpr={[1, 2]}>
      <Scene venue={venue} active={active} onProgress={onProgress ?? (() => {})} />
    </Canvas>
  );
}
