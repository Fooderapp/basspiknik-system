"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Float } from "@react-three/drei";
import * as THREE from "three";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { latLngToVec3, type Venue } from "@/lib/venue";
import type { Dictionary } from "@/lib/i18n";

const GLOBE_R = 2;
const GREEN = "#3C7A1E";
const YELLOW = "#C7E04A";
const LAKE = "#2E7FB8";

/* ── Dot-cloud globe ──────────────────────────────────────────────────────── */
function DotGlobe() {
  const geometry = useMemo(() => {
    const N = typeof window !== "undefined" && window.innerWidth < 640 ? 3500 : 6500;
    const positions = new Float32Array(N * 3);
    const colors = new Float32Array(N * 3);
    const green = new THREE.Color(GREEN);
    const yellow = new THREE.Color(YELLOW);
    const golden = Math.PI * (3 - Math.sqrt(5)); // Fibonacci sphere
    for (let i = 0; i < N; i++) {
      const y = 1 - (i / (N - 1)) * 2;
      const r = Math.sqrt(1 - y * y);
      const theta = golden * i;
      positions[i * 3] = Math.cos(theta) * r * GLOBE_R;
      positions[i * 3 + 1] = y * GLOBE_R;
      positions[i * 3 + 2] = Math.sin(theta) * r * GLOBE_R;
      const c = Math.random() > 0.86 ? yellow : green;
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return geo;
  }, []);

  return (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <points geometry={geometry as any}>
      <pointsMaterial
        size={0.028}
        vertexColors
        sizeAttenuation
        transparent
        opacity={0.95}
        depthWrite={false}
      />
    </points>
  );
}

/* ── Mini diorama that sits tangent to the globe surface ───────────────────── */
function Diorama({ onOpen }: { onOpen: () => void }) {
  const [hovered, setHovered] = useState(false);
  const pinRef = useRef<THREE.Mesh>(null);

  useEffect(() => {
    document.body.style.cursor = hovered ? "pointer" : "auto";
    return () => { document.body.style.cursor = "auto"; };
  }, [hovered]);

  useFrame((state) => {
    if (pinRef.current) {
      const t = state.clock.elapsedTime;
      pinRef.current.position.y = 0.62 + Math.sin(t * 2) * 0.04;
    }
  });

  return (
    <group
      scale={0.26}
      onClick={(e) => { e.stopPropagation(); onOpen(); }}
      onPointerOver={(e) => { e.stopPropagation(); setHovered(true); }}
      onPointerOut={() => setHovered(false)}
    >
      {/* Ground disc */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]}>
        <cylinderGeometry args={[1.15, 1.15, 0.1, 48]} />
        <meshStandardMaterial color={GREEN} />
      </mesh>

      {/* Lake */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0.45, 0.01, 0.35]}>
        <circleGeometry args={[0.5, 40]} />
        <meshStandardMaterial color={LAKE} metalness={0.3} roughness={0.2} />
      </mesh>

      {/* Stage */}
      <mesh position={[-0.45, 0.12, -0.2]}>
        <boxGeometry args={[0.5, 0.24, 0.35]} />
        <meshStandardMaterial color="#16170F" />
      </mesh>
      {/* Stage canopy */}
      <mesh position={[-0.45, 0.3, -0.2]}>
        <boxGeometry args={[0.6, 0.04, 0.45]} />
        <meshStandardMaterial color={YELLOW} emissive={YELLOW} emissiveIntensity={0.25} />
      </mesh>

      {/* Tents */}
      {[[-0.1, 0.5], [0.15, 0.6], [-0.3, 0.7]].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.12, z]}>
          <coneGeometry args={[0.16, 0.28, 4]} />
          <meshStandardMaterial color={i % 2 ? YELLOW : "#E8553A"} />
        </mesh>
      ))}

      {/* Trees */}
      {[[-0.7, 0.5], [0.8, -0.5], [-0.8, -0.4], [0.7, 0.7]].map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh position={[0, 0.18, 0]}>
            <coneGeometry args={[0.14, 0.4, 8]} />
            <meshStandardMaterial color="#255A14" />
          </mesh>
        </group>
      ))}

      {/* Glowing pin */}
      <mesh ref={pinRef} position={[0, 0.62, 0]} rotation={[Math.PI, 0, 0]}>
        <coneGeometry args={[0.12, 0.3, 24]} />
        <meshStandardMaterial color={YELLOW} emissive={YELLOW} emissiveIntensity={hovered ? 1.4 : 0.8} />
      </mesh>
      <mesh position={[0, 0.78, 0]}>
        <sphereGeometry args={[0.09, 24, 24]} />
        <meshStandardMaterial color={YELLOW} emissive={YELLOW} emissiveIntensity={hovered ? 1.6 : 0.9} />
      </mesh>
      {/* Halo */}
      <mesh position={[0, 0.78, 0]}>
        <sphereGeometry args={[0.18, 24, 24]} />
        <meshBasicMaterial color={YELLOW} transparent opacity={hovered ? 0.28 : 0.16} depthWrite={false} />
      </mesh>
    </group>
  );
}

/* ── Scene: globe + diorama + camera fly-to ────────────────────────────────── */
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function Scene({ venue, active, onOpen }: { venue: Venue; active: boolean; onOpen: () => void }) {
  const globeRef = useRef<THREE.Group>(null);
  const progress = useRef(0); // 0 = wide shot, 1 = arrived at diorama
  const [arrived, setArrived] = useState(false);

  // Plain-number geometry — kept as arrays so nothing crosses the R3F type
  // boundary as a foreign THREE instance (the monorepo has two @types/three).
  const { venueArr, lookAtArr, camFar, camNear, dioramaQuat } = useMemo(() => {
    const v = latLngToVec3(venue.lat, venue.lng, GLOBE_R);
    const dir: [number, number, number] = [v[0] / GLOBE_R, v[1] / GLOBE_R, v[2] / GLOBE_R];
    const scale = (s: number): [number, number, number] => [dir[0] * s, dir[1] * s, dir[2] * s];
    const q = new THREE.Quaternion()
      .setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...dir))
      .toArray() as [number, number, number, number];
    return {
      venueArr: v,
      lookAtArr: scale(GLOBE_R + 0.32), // aim above the surface, at the diorama body
      camFar: scale(6.2),
      camNear: scale(GLOBE_R + 0.85),
      dioramaQuat: q,
    };
  }, [venue]);

  useFrame((state, delta) => {
    // Idle: slow auto-rotate until the section is in view
    if (!active && globeRef.current) {
      globeRef.current.rotation.y += delta * 0.12;
    }

    const target = active ? 1 : 0;
    progress.current = THREE.MathUtils.damp(progress.current, target, 2.2, delta);
    const p = progress.current;
    const e = p * p * (3 - 2 * p); // smoothstep

    if (!arrived) {
      state.camera.position.set(
        lerp(camFar[0], camNear[0], e),
        lerp(camFar[1], camNear[1], e),
        lerp(camFar[2], camNear[2], e),
      );
      state.camera.lookAt(lookAtArr[0] * e, lookAtArr[1] * e, lookAtArr[2] * e);
    }

    if (p > 0.985 && !arrived) setArrived(true);
    if (p < 0.5 && arrived) setArrived(false);
  });

  return (
    <>
      <ambientLight intensity={0.7} />
      <directionalLight position={[5, 5, 5]} intensity={1.1} />
      <directionalLight position={[-4, 2, -3]} intensity={0.4} color={YELLOW} />

      <group ref={globeRef}>
        <DotGlobe />
        <group position={venueArr} quaternion={dioramaQuat}>
          <Float speed={2} rotationIntensity={0} floatIntensity={0.3}>
            <Diorama onOpen={onOpen} />
          </Float>
        </group>
      </group>

      {arrived && (
        <OrbitControls
          target={lookAtArr}
          enablePan={false}
          enableZoom
          minDistance={GLOBE_R + 0.45}
          maxDistance={GLOBE_R + 2.5}
          autoRotate
          autoRotateSpeed={0.6}
        />
      )}
    </>
  );
}

/* ── Public component ──────────────────────────────────────────────────────── */
export function VenueGlobe({ venue, dict, lang }: { venue: Venue; dict: Dictionary; lang: "en" | "hu" }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => setActive(entry.isIntersecting && entry.intersectionRatio > 0.4),
      { threshold: [0, 0.4, 0.8] },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative h-[70vh] w-full overflow-hidden rounded-[2.5rem]"
      style={{ background: "radial-gradient(circle at 50% 38%, #18220E 0%, #0B0F07 72%)" }}
    >
      <Canvas
        camera={{ position: [0, 0, 6.2], fov: 45 }}
        gl={{ antialias: true, alpha: true }}
        dpr={[1, 2]}
      >
        <Scene venue={venue} active={active} onOpen={() => setOpen(true)} />
      </Canvas>

      {/* Hint */}
      <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center">
        <span className="rounded-full bg-black/40 px-4 py-1.5 text-xs font-medium text-white backdrop-blur">
          {dict["location.tap_hint"]}
        </span>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg overflow-hidden rounded-3xl p-0">
          {venue.images.length > 0 ? (
            <div className="flex gap-2 overflow-x-auto p-2">
              {venue.images.map((src) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={src}
                  src={src}
                  alt={venue.name}
                  className="h-44 w-64 flex-none rounded-2xl object-cover"
                />
              ))}
            </div>
          ) : (
            <div
              className="flex h-40 items-end p-5"
              style={{ background: "radial-gradient(circle at 30% 20%, #3C7A1E 0%, #16170F 85%)" }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.svg" alt={venue.name} className="h-8 w-auto opacity-90" />
            </div>
          )}
          <DialogHeader className="px-6 pb-2 pt-1 text-left">
            <DialogTitle className="text-2xl font-extrabold tracking-tight">{venue.name}</DialogTitle>
            <DialogDescription className="text-base leading-relaxed text-muted-foreground">
              {venue.description[lang]}
            </DialogDescription>
          </DialogHeader>
          <div className="px-6 pb-6">
            <Button asChild variant="brand" size="pill" className="w-full">
              <a href={venue.mapsUrl} target="_blank" rel="noopener noreferrer">
                {dict["location.directions"]}
              </a>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
