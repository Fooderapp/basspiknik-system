"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { AfterimagePass } from "three/examples/jsm/postprocessing/AfterimagePass.js";
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

// Two clouds: base = always on, detail = fades in as camera zooms (more dots near).
function buildGeometries() {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = LAND_MASK;
  return new Promise<{ base: THREE.BufferGeometry; detail: THREE.BufferGeometry }>((resolve, reject) => {
    img.onload = () => {
      const cw = img.width, ch = img.height;
      const canvas = document.createElement("canvas");
      canvas.width = cw; canvas.height = ch;
      const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, cw, ch).data;

      const isMobile = typeof window !== "undefined" && window.innerWidth < 640;
      // Dense candidate set — only land survives the mask (~1 draw call per cloud).
      const CANDIDATES = isMobile ? 55000 : 130000;
      const DETAIL_FRACTION = 0.62; // most points live in the zoom-in detail layer

      const bPos: number[] = [], bCol: number[] = [];
      const dPos: number[] = [], dCol: number[] = [];
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

        const roll = Math.random();
        const c = roll > 0.9 ? yellow : roll > 0.62 ? greenHi : green;
        if (Math.random() < DETAIL_FRACTION) {
          dPos.push(x * GLOBE_R, y * GLOBE_R, z * GLOBE_R);
          dCol.push(c.r, c.g, c.b);
        } else {
          bPos.push(x * GLOBE_R, y * GLOBE_R, z * GLOBE_R);
          bCol.push(c.r, c.g, c.b);
        }
      }

      const mk = (pos: number[], col: number[]) => {
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(pos), 3));
        g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(col), 3));
        return g;
      };
      resolve({ base: mk(bPos, bCol), detail: mk(dPos, dCol) });
    };
    img.onerror = reject;
  });
}

function DotGlobe({ zoom }: { zoom: React.MutableRefObject<number> }) {
  const [geos, setGeos] = useState<{ base: THREE.BufferGeometry; detail: THREE.BufferGeometry } | null>(null);
  const dotTex = useMemo(makeDotTexture, []);
  const baseMat = useRef<THREE.PointsMaterial | null>(null);
  const detailMat = useRef<THREE.PointsMaterial | null>(null);

  useEffect(() => {
    let cancelled = false;
    buildGeometries().then((g) => { if (!cancelled) setGeos(g); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Shrink dots as we zoom in (stay crisp); fade detail layer in with zoom.
  useFrame(() => {
    const z = zoom.current; // 0 = far, 1 = near
    const size = THREE.MathUtils.lerp(0.022, 0.008, z);
    if (baseMat.current) baseMat.current.size = size;
    if (detailMat.current) {
      detailMat.current.size = size;
      detailMat.current.opacity = THREE.MathUtils.clamp(z * 1.4, 0, 1);
    }
  });

  if (!geos) return null;
  return (
    <>
      {/* eslint-disable @typescript-eslint/no-explicit-any */}
      <points geometry={geos.base as any}>
        <pointsMaterial
          ref={baseMat as any}
          map={dotTex as any}
          size={0.022}
          vertexColors
          sizeAttenuation
          transparent
          alphaTest={0.45}
          depthWrite={false}
        />
      </points>
      <points geometry={geos.detail as any}>
        <pointsMaterial
          ref={detailMat as any}
          map={dotTex as any}
          size={0.022}
          opacity={0}
          vertexColors
          sizeAttenuation
          transparent
          alphaTest={0.2}
          depthWrite={false}
        />
      </points>
      {/* eslint-enable @typescript-eslint/no-explicit-any */}
    </>
  );
}

/* ── Motion blur: feedback trail, strength tracks zoom speed (self-clears) ──── */
function MotionBlur({ zoom }: { zoom: React.MutableRefObject<number> }) {
  const { gl, scene, camera, size } = useThree();
  const prevZoom = useRef(0);

  const { composer, after } = useMemo(() => {
    const c = new EffectComposer(gl);
    c.addPass(new RenderPass(scene, camera));
    const a = new AfterimagePass(0); // damp 0 = clean pass-through, no ghost when idle
    c.addPass(a);
    return { composer: c, after: a };
  }, [gl, scene, camera]);

  useEffect(() => {
    composer.setSize(size.width, size.height);
    composer.setPixelRatio(gl.getPixelRatio());
  }, [composer, gl, size]);

  // Render priority > 0 hands the loop to us; blur damp ramps with zoom velocity.
  useFrame((_, delta) => {
    const speed = Math.abs(zoom.current - prevZoom.current) / Math.max(delta, 1e-4);
    prevZoom.current = zoom.current;
    const target = THREE.MathUtils.clamp(speed * 0.9, 0, 0.62);
    const u = after.uniforms.damp as { value: number };
    u.value = THREE.MathUtils.damp(u.value, target, 6, delta);
    composer.render(delta);
  }, 1);

  return null;
}

/* ── Scene: zoom from space (continents) toward the country ────────────────── */
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function Scene({ venue, active, onProgress, zoom }: { venue: Venue; active: boolean; onProgress: (p: number) => void; zoom: React.MutableRefObject<number> }) {
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
    zoom.current = e;

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
        <DotGlobe zoom={zoom} />
      </group>

      <MotionBlur zoom={zoom} />
    </>
  );
}

/* ── Public component — the dotted-globe intro ─────────────────────────────── */
export function VenueGlobe({ venue, active, onProgress }: { venue: Venue; active: boolean; onProgress?: (p: number) => void }) {
  const zoom = useRef(0);
  return (
    <Canvas camera={{ position: [0, 0, 7.6], fov: 45 }} gl={{ antialias: true, alpha: true }} dpr={[1, 2]}>
      <Scene venue={venue} active={active} onProgress={onProgress ?? (() => {})} zoom={zoom} />
    </Canvas>
  );
}
