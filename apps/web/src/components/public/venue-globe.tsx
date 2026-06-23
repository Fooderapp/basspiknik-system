"use client";

import { useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import * as topojson from "topojson-client";
import { latLngToVec3, type Venue } from "@/lib/venue";

/* eslint-disable @typescript-eslint/no-explicit-any */

const GLOBE_R = 2;
const GREEN = "#3C7A1E";
const GREEN_HI = "#5B9E2E";
const YELLOW = "#C7E04A";
const COAST = "#264F0F"; // dark green coastline — reads crisp on the light hero bg
const LAND_TOPO = "/venue/land-110m.json";
const COUNTRIES_TOPO = "/venue/countries-110m.json";

// lng/lat → point on the sphere (radius R). Sits just above the surface so the
// depth sphere occludes the far hemisphere without z-fighting the near one.
function ll(lng: number, lat: number, R: number): THREE.Vector3 {
  const v = latLngToVec3(lat, lng, 1);
  return new THREE.Vector3(v[0], v[1], v[2]).normalize().multiplyScalar(R);
}

// Push a great-circle arc (as segment pairs) so lines hug the curve on zoom-in.
function pushArc(out: number[], a: THREE.Vector3, b: THREE.Vector3, R: number) {
  const ang = a.angleTo(b);
  const steps = Math.max(1, Math.ceil(ang / THREE.MathUtils.degToRad(2)));
  let prev = a;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const p = a.clone().lerp(b, t).normalize().multiplyScalar(R); // ≈ slerp for small arcs
    out.push(prev.x, prev.y, prev.z, p.x, p.y, p.z);
    prev = p;
  }
}

// MultiLineString GeoJSON → LineSegments BufferGeometry on the sphere.
function geoToGeometry(geo: any, R: number): THREE.BufferGeometry {
  const out: number[] = [];
  const lines: number[][][] = geo.type === "MultiLineString" ? geo.coordinates : [geo.coordinates];
  for (const line of lines) {
    for (let i = 0; i < line.length - 1; i++) {
      pushArc(out, ll(line[i][0], line[i][1], R), ll(line[i + 1][0], line[i + 1][1], R), R);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(out), 3));
  return g;
}

type CoastData = { coast: THREE.BufferGeometry; coastHi: THREE.BufferGeometry; borders: THREE.BufferGeometry };

// Module-level singleton loader. Fetched once, shared across mounts. Kicked off
// from useFrame (R3F's loop always runs) rather than useEffect, which the
// continuously-updating hero parent can starve before its passive flush.
let coastCache: CoastData | null = null;
let coastPromise: Promise<CoastData> | null = null;
function loadCoastlines(): Promise<CoastData> {
  if (coastCache) return Promise.resolve(coastCache);
  if (coastPromise) return coastPromise;
  coastPromise = Promise.all([
    fetch(LAND_TOPO).then((r) => r.json()),
    fetch(COUNTRIES_TOPO).then((r) => r.json()),
  ]).then(([landTopo, ctryTopo]: any[]) => {
    const coastGeo = topojson.mesh(landTopo, landTopo.objects.land);
    const borderGeo = topojson.mesh(ctryTopo, ctryTopo.objects.countries, (a: any, b: any) => a !== b);
    coastCache = {
      coast: geoToGeometry(coastGeo, GLOBE_R * 1.003),
      coastHi: geoToGeometry(coastGeo, GLOBE_R * 1.006),
      borders: geoToGeometry(borderGeo, GLOBE_R * 1.001),
    };
    return coastCache;
  });
  return coastPromise;
}

function Coastlines({ zoom }: { zoom: React.MutableRefObject<number> }) {
  const [data, setData] = useState<CoastData | null>(coastCache);
  const started = useRef(false);
  const hiRef = useRef<THREE.LineBasicMaterial | null>(null);

  useFrame(() => {
    if (!started.current && !data) {
      started.current = true;
      loadCoastlines().then(setData).catch(() => {});
    }
    if (hiRef.current) hiRef.current.opacity = THREE.MathUtils.lerp(0.45, 0.9, zoom.current);
  });

  if (!data) return null;
  return (
    <>
      {/* Faint inner country borders — "data" richness behind the coast */}
      <lineSegments geometry={data.borders}>
        <lineBasicMaterial color={GREEN} transparent opacity={0.3} depthWrite={false} />
      </lineSegments>
      {/* Coastline core — dark, crisp, reads on the light hero bg */}
      <lineSegments geometry={data.coast}>
        <lineBasicMaterial color={COAST} transparent opacity={0.95} depthWrite={false} />
      </lineSegments>
      {/* Coastline lime sheen — the "glow" edge */}
      <lineSegments geometry={data.coastHi}>
        <lineBasicMaterial ref={hiRef as any} color={GREEN_HI} transparent opacity={0.6} depthWrite={false} blending={THREE.AdditiveBlending} />
      </lineSegments>
    </>
  );
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
        {/* Depth sphere: only the near hemisphere of lines shows (occludes the back). */}
        <mesh>
          <sphereGeometry args={[GLOBE_R * 0.99, 64, 64]} />
          <meshBasicMaterial colorWrite={false} />
        </mesh>
        <Coastlines zoom={zoom} />
      </group>
    </>
  );
}

/* ── Public component — the vector-coastline globe intro ───────────────────── */
export function VenueGlobe({ venue, active, onProgress }: { venue: Venue; active: boolean; onProgress?: (p: number) => void }) {
  const zoom = useRef(0);
  return (
    <Canvas camera={{ position: [0, 0, 7.6], fov: 45 }} gl={{ antialias: true, alpha: true }} dpr={[1, 2]}>
      <Scene venue={venue} active={active} onProgress={onProgress ?? (() => {})} zoom={zoom} />
    </Canvas>
  );
}
