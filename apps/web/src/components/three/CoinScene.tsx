"use client";

import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Float } from "@react-three/drei";
import * as THREE from "three";

/** Five-point star as an extrudable THREE.Shape. */
function useStarShape() {
  return useMemo(() => {
    const shape = new THREE.Shape();
    const spikes = 5;
    const outer = 0.55;
    const inner = 0.24;
    for (let i = 0; i < spikes * 2; i++) {
      const r = i % 2 === 0 ? outer : inner;
      const a = (Math.PI / spikes) * i - Math.PI / 2;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      if (i === 0) shape.moveTo(x, y);
      else shape.lineTo(x, y);
    }
    shape.closePath();
    return shape;
  }, []);
}

function Coin() {
  const group = useRef<THREE.Group>(null);
  const star = useStarShape();

  useFrame((_, delta) => {
    if (group.current) group.current.rotation.y += delta * 1.4;
  });

  const gold = { color: "#f4b51a", metalness: 0.55, roughness: 0.3, emissive: "#7a4a00", emissiveIntensity: 0.25 };

  return (
    <group ref={group} rotation={[0.18, 0, 0]}>
      {/* coin body */}
      <mesh castShadow>
        <cylinderGeometry args={[1, 1, 0.16, 64]} />
        <meshStandardMaterial {...gold} />
      </mesh>
      {/* raised rim */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.98, 0.05, 24, 80]} />
        <meshStandardMaterial color="#ffd76a" metalness={0.7} roughness={0.2} />
      </mesh>
      {/* embossed stars on both faces */}
      {[0.085, -0.085].map((z, i) => (
        <mesh key={i} position={[0, 0, z]} rotation={[i === 1 ? Math.PI : 0, 0, 0]}>
          <extrudeGeometry args={[star, { depth: 0.05, bevelEnabled: false }]} />
          <meshStandardMaterial color="#5a3a00" metalness={0.4} roughness={0.5} />
        </mesh>
      ))}
    </group>
  );
}

export default function CoinScene({ className }: { className?: string }) {
  return (
    <Canvas
      className={className}
      dpr={[1, 2]}
      camera={{ position: [0, 0, 3.4], fov: 45 }}
      gl={{ alpha: true, antialias: true }}
    >
      <ambientLight intensity={0.6} />
      <directionalLight position={[3, 4, 5]} intensity={2.2} color="#fff6e0" />
      <directionalLight position={[-4, -2, 2]} intensity={0.8} color="#ffb347" />
      <pointLight position={[0, 0, 4]} intensity={1.2} color="#ffffff" />
      <Float speed={2} rotationIntensity={0.4} floatIntensity={0.8}>
        <Coin />
      </Float>
    </Canvas>
  );
}
