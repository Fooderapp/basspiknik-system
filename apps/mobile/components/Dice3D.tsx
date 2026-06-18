import { useEffect, useRef } from "react";
import { GLView, type ExpoWebGLRenderingContext } from "expo-gl";
import {
  WebGLRenderer,
  AmbientLight,
  Color,
  DataTexture,
  DirectionalLight,
  Group,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Quaternion,
  RGBAFormat,
  Scene,
  Vector3,
} from "three";
// @ts-ignore — three/examples/jsm is JS-only, types may not resolve
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

// BoxGeometry face-material order: +X, -X, +Y, -Y, +Z, -Z
// Map each slot to the die value whose outward normal matches:
// +X=3, -X=4, +Y=1, -Y=6, +Z=2, -Z=5
const FACE_VALUES = [3, 4, 1, 6, 2, 5];

/* ─── Texture generation ────────────────────────────────────────────────────── */
const TEX = 256; // texture resolution (power of 2)
const PIP_R = TEX * 0.10; // pip radius in px
// pip offset scale — without this, ±O maps exactly to texture edges (pixel 0/TEX),
// clipping every corner pip. SCALE pulls centres inward so pips are fully visible.
const PIP_SCALE = 0.68;

function hexToRgb(hex: number) {
  return { r: (hex >> 16) & 0xff, g: (hex >> 8) & 0xff, b: hex & 0xff };
}

/**
 * Generates a DataTexture for one die face.
 * Background colour and pip colour are passed as 0xRRGGBB ints.
 * Pips are anti-aliased circles rendered in software — no canvas needed.
 */
function makeFaceTex(value: number, bg: number, pip: number): DataTexture {
  const { r: br, g: bg_, b: bb } = hexToRgb(bg);
  const { r: pr, g: pg, b: pb } = hexToRgb(pip);

  const data = new Uint8Array(TEX * TEX * 4);
  // Fill background
  for (let i = 0; i < TEX * TEX; i++) {
    data[i * 4]     = br;
    data[i * 4 + 1] = bg_;
    data[i * 4 + 2] = bb;
    data[i * 4 + 3] = 255;
  }

  // Pip centres in pixel space. UV range is ~[-0.62, 0.62] → [0, TEX]
  const uvPips = PIP_UV[value] ?? [[0, 0]];
  for (const [u, v] of uvPips) {
    const cx = (u / (O * 2) * PIP_SCALE + 0.5) * TEX;
    const cy = (1 - (v / (O * 2) * PIP_SCALE + 0.5)) * TEX; // flip Y for texture coords

    // Draw anti-aliased filled circle
    const rOuter = PIP_R;
    const rInner = PIP_R - 1.5; // 1.5-px smooth border

    // Bounding box
    const x0 = Math.max(0, Math.floor(cx - rOuter - 1));
    const x1 = Math.min(TEX - 1, Math.ceil(cx + rOuter + 1));
    const y0 = Math.max(0, Math.floor(cy - rOuter - 1));
    const y1 = Math.min(TEX - 1, Math.ceil(cy + rOuter + 1));

    for (let py = y0; py <= y1; py++) {
      for (let px = x0; px <= x1; px++) {
        const dist = Math.sqrt((px - cx) ** 2 + (py - cy) ** 2);
        if (dist >= rOuter) continue;
        // 0 at edge, 1 at centre
        const alpha = dist <= rInner ? 1 : (rOuter - dist) / (rOuter - rInner);

        const idx = (py * TEX + px) * 4;
        data[idx]     = Math.round(pr * alpha + br * (1 - alpha));
        data[idx + 1] = Math.round(pg * alpha + bg_ * (1 - alpha));
        data[idx + 2] = Math.round(pb * alpha + bb * (1 - alpha));
        data[idx + 3] = 255;
      }
    }
  }

  const tex = new DataTexture(data, TEX, TEX, RGBAFormat);
  tex.needsUpdate = true;
  return tex;
}

// Pre-generate both colour themes
const BG_WHITE  = 0xf5f5fa;
const BG_GOLD   = 0xfbbf24;
const PIP_DARK  = 0x111111;
const PIP_WIN   = 0x7c2d12;

function makeMaterials(bgHex: number, pipHex: number): MeshStandardMaterial[] {
  return FACE_VALUES.map((v) =>
    new MeshStandardMaterial({
      map: makeFaceTex(v, bgHex, pipHex),
      roughness: 0.38,
      metalness: 0.06,
    }),
  );
}

/* ─── Die orientation helpers ───────────────────────────────────────────────── */
const UP = new Vector3(0, 1, 0);
// Outward normal of the face carrying each pip value
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
  // random 90° yaw so the settled die isn't always identical
  const yaw = new Quaternion().setFromAxisAngle(UP, (Math.floor(Math.random() * 4) * Math.PI) / 2);
  return yaw.multiply(base);
}

/* ─── Misc helpers ──────────────────────────────────────────────────────────── */
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const rand = (a: number, b: number) => a + Math.random() * (b - a);

interface DieRig {
  group: Group;
  mesh: Mesh;
  normalMats: MeshStandardMaterial[];
  winMats: MeshStandardMaterial[];
  quat: Quaternion;
  angVel: Vector3;
  fromQ: Quaternion;
  toQ: Quaternion;
  settling: boolean;
  t: number;
  phase: number;
}

function buildDie(): DieRig {
  const normalMats = makeMaterials(BG_WHITE, PIP_DARK);
  const winMats    = makeMaterials(BG_GOLD,  PIP_WIN);

  // Rounded-corner cube: size 2, 4 segments for smooth bevels, bevel radius 0.18
  const geo = new RoundedBoxGeometry(2, 2, 2, 4, 0.18);
  const mesh = new Mesh(geo, normalMats);

  const group = new Group();
  group.add(mesh);

  return {
    group, mesh, normalMats, winMats,
    quat: new Quaternion(),
    angVel: new Vector3(),
    fromQ: new Quaternion(),
    toQ: new Quaternion(),
    settling: false,
    t: 0,
    phase: Math.random() * Math.PI * 2,
  };
}

/* ─── Component ─────────────────────────────────────────────────────────────── */
interface Dice3DProps {
  rolling: boolean;
  faces: [number, number];
  win: boolean;
  width?: number;
  height?: number;
}

export function Dice3D({ rolling, faces, win, width = 252, height = 160 }: Dice3DProps) {
  const rollingRef = useRef(rolling);
  const facesRef   = useRef(faces);
  const winRef     = useRef(win);
  rollingRef.current = rolling;
  facesRef.current   = faces;
  winRef.current     = win;

  const rafRef = useRef<number | null>(null);
  useEffect(() => () => { if (rafRef.current != null) cancelAnimationFrame(rafRef.current); }, []);

  function onContextCreate(gl: ExpoWebGLRenderingContext) {
    const w = gl.drawingBufferWidth;
    const h = gl.drawingBufferHeight;

    const renderer = new WebGLRenderer({
      canvas: {
        width: w, height: h,
        style: {}, clientHeight: h,
        addEventListener: () => {}, removeEventListener: () => {},
      } as unknown as HTMLCanvasElement,
      context: gl as unknown as WebGL2RenderingContext,
    });
    renderer.setPixelRatio(1);
    renderer.setSize(w, h);
    renderer.setClearColor(new Color(0x0c0c0f), 1);

    const scene = new Scene();

    // ── Camera: more top-down so die top face is clearly visible ──────────────
    const camera = new PerspectiveCamera(40, w / h, 0.1, 100);
    camera.position.set(0, 7.2, 4.6); // high Y, moderate Z → ~57° elevation
    camera.lookAt(0, 0, 0);

    // ── Lighting ─────────────────────────────────────────────────────────────
    scene.add(new AmbientLight(0xffffff, 1.0));
    const key = new DirectionalLight(0xffffff, 1.2);
    key.position.set(2, 8, 5);
    scene.add(key);
    const fill = new DirectionalLight(0xffffff, 0.4);
    fill.position.set(-4, 3, -2);
    scene.add(fill);
    const amber = new DirectionalLight(0xf59e0b, 0.3);
    amber.position.set(0, -3, 4);
    scene.add(amber);

    const dice = [buildDie(), buildDie()];
    dice[0].group.position.x = -1.55;
    dice[1].group.position.x =  1.55;
    dice.forEach((d) => scene.add(d.group));

    let prevRolling = false;
    let prevWin = false;
    let last = Date.now();
    const SETTLE = 0.75;

    const loop = () => {
      rafRef.current = requestAnimationFrame(loop);
      const now = Date.now();
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;

      const isRolling = rollingRef.current;

      // Rising edge — kick into tumble
      if (isRolling && !prevRolling) {
        dice.forEach((d) => {
          d.settling = false;
          d.angVel.set(rand(9, 17), rand(7, 14), rand(9, 17));
          if (Math.random() < 0.5) d.angVel.x *= -1;
          if (Math.random() < 0.5) d.angVel.z *= -1;
        });
      }
      // Falling edge — slerp to final face-up orientation
      if (!isRolling && prevRolling) {
        dice.forEach((d, i) => {
          d.fromQ.copy(d.quat);
          d.toQ.copy(targetQuat(facesRef.current[i] ?? 1));
          d.t = 0;
          d.settling = true;
        });
      }
      prevRolling = isRolling;

      // Win recolour
      if (winRef.current !== prevWin) {
        prevWin = winRef.current;
        dice.forEach((d) => {
          d.mesh.material = prevWin ? d.winMats : d.normalMats;
        });
      }

      dice.forEach((d) => {
        if (isRolling && !d.settling) {
          const speed = d.angVel.length();
          if (speed > 1e-4) {
            const axis = d.angVel.clone().multiplyScalar(1 / speed);
            d.quat.premultiply(new Quaternion().setFromAxisAngle(axis, speed * dt));
          }
          d.group.position.y = Math.sin(now * 0.011 + d.phase) * 0.3;
        } else if (d.settling) {
          d.t = Math.min(d.t + dt / SETTLE, 1);
          const e = easeOutCubic(d.t);
          d.quat.slerpQuaternions(d.fromQ, d.toQ, e);
          d.group.position.y = Math.sin(e * Math.PI) * 0.6;
          if (d.t >= 1) d.settling = false;
        } else {
          d.group.position.y += (0 - d.group.position.y) * 0.1;
        }
        d.group.quaternion.copy(d.quat);
      });

      renderer.render(scene, camera);
      gl.endFrameEXP();
    };

    loop();
  }

  return <GLView style={{ width, height }} onContextCreate={onContextCreate} />;
}
