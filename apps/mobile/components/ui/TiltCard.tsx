"use client";
import { useEffect, useRef } from "react";
import { type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { DeviceMotion } from "expo-sensors";

interface Props {
  children: React.ReactNode;
  maxTilt?: number;
  gyro?: boolean;
  pan?: boolean;
  /** holo=true / "shimmer" → translucent specular sheen sweeps with tilt.
   *  holo=false → no overlay (just 3D tilt). */
  holo?: boolean | "shimmer";
  radius?: number;
  /** Opaque background colour for the rotated layer. REQUIRED to avoid the iOS
   *  perspective "black wedge": a transparent 3D-rotated layer composites one of
   *  its two triangles against a black buffer. An opaque backing fills both. */
  surface?: string;
  style?: StyleProp<ViewStyle>;
}

const clampJS = (v: number, m: number) => Math.max(-m, Math.min(m, v));

export function TiltCard({
  children,
  maxTilt = 8,
  gyro = true,
  pan = true,
  holo = true,
  radius = 24,
  surface,
  style,
}: Props) {
  const gRx = useSharedValue(0);
  const gRy = useSharedValue(0);
  const pRx = useSharedValue(0);
  const pRy = useSharedValue(0);

  const rest = useRef<{ beta: number; gamma: number } | null>(null);

  useEffect(() => {
    if (!gyro) return;
    DeviceMotion.setUpdateInterval(50);
    const sub = DeviceMotion.addListener(({ rotation }) => {
      if (!rotation) return;
      const beta  = (rotation.beta  * 180) / Math.PI;
      const gamma = (rotation.gamma * 180) / Math.PI;
      if (!rest.current) rest.current = { beta, gamma };
      gRx.value = withTiming(clampJS(-(beta  - rest.current.beta)  / 2.2, maxTilt), { duration: 120 });
      gRy.value = withTiming(clampJS( (gamma - rest.current.gamma) / 2.2, maxTilt), { duration: 120 });
    });
    return () => sub.remove();
  }, [gyro, maxTilt, gRx, gRy]);

  const panGesture = Gesture.Pan()
    .enabled(pan)
    .onUpdate((e) => {
      "worklet";
      pRx.value = Math.max(-maxTilt, Math.min(maxTilt, -e.translationY / 9));
      pRy.value = Math.max(-maxTilt, Math.min(maxTilt,  e.translationX / 9));
    })
    .onEnd(() => {
      "worklet";
      pRx.value = withSpring(0, { stiffness: 200, damping: 18 });
      pRy.value = withSpring(0, { stiffness: 200, damping: 18 });
    });

  const cardStyle = useAnimatedStyle(() => {
    const rx = Math.max(-maxTilt, Math.min(maxTilt, gRx.value + pRx.value));
    const ry = Math.max(-maxTilt, Math.min(maxTilt, gRy.value + pRy.value));
    return {
      transform: [
        { perspective: 1200 },
        { rotateX: `${rx}deg` },
        { rotateY: `${ry}deg` },
      ],
      // Opaque backing on the rotated layer. A transparent 3D-rotated layer
      // composites one of its two triangles against a black buffer → diagonal
      // "black wedge". An opaque surface (+ matching radius) fills both tris.
      backgroundColor: surface ?? "transparent",
      borderRadius: radius,
      // NOTE: do NOT put overflow:"hidden" here. On iOS, overflow:hidden on a
      // perspective-rotated layer forces a clip buffer that gets black-backed on
      // one of the two triangles → the "black wedge". The sheen is clipped by a
      // FLAT (non-transformed) child below, which is safe.
      shadowColor: "transparent",
      shadowOpacity: 0,
      shadowRadius: 0,
      elevation: 0,
    };
  });

  // Plain-View specular sheen — a translucent white diagonal bar that sweeps
  // left↔right with the tilt. No react-native-svg layer in the 3D context, so
  // nothing can mis-composite into a wedge. Clipped by the opaque rotated layer.
  const sheenStyle = useAnimatedStyle(() => {
    const rx = Math.max(-maxTilt, Math.min(maxTilt, gRx.value + pRx.value));
    const ry = Math.max(-maxTilt, Math.min(maxTilt, gRy.value + pRy.value));
    const mag = (Math.abs(rx) + Math.abs(ry)) / maxTilt;
    // ry drives horizontal sweep; map [-maxTilt, maxTilt] → [-1, 1]
    const t = ry / maxTilt;
    return {
      opacity: Math.min(0.5, 0.08 + mag * 0.45),
      transform: [
        { translateX: interpolate(t, [-1, 1], [-160, 160]) },
        { rotate: "18deg" },
      ],
    };
  });

  const showOverlay = holo !== false;

  return (
    <GestureDetector gesture={panGesture}>
      {/* Flat opaque backing (NO 3D transform). When the inner layer is
          perspective-rotated, iOS triangulates its quad; the triangle that folds
          toward the viewer reveals whatever is *behind* it. With a transparent
          parent that is the black framebuffer → the "black wedge". This flat
          backing — same colour + radius, sitting in the normal plane — fills that
          space instead, so both triangles composite against an opaque surface. */}
      <Animated.View
        style={[
          {
            borderRadius: radius,
            backgroundColor: surface ?? "transparent",
          },
          style,
        ]}
      >
      <Animated.View style={cardStyle}>
        {children}

        {showOverlay && (
          // FLAT clip layer (no 3D transform) → overflow:hidden is safe here and
          // does NOT trigger the iOS perspective black-wedge. Clips the sheen to
          // the rounded card.
          <Animated.View
            pointerEvents="none"
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              borderRadius: radius,
              overflow: "hidden",
            }}
          >
            <Animated.View
              style={[
                {
                  position: "absolute",
                  top: -80,
                  bottom: -80,
                  left: "35%",
                  width: "30%",
                  backgroundColor: "#ffffff",
                },
                sheenStyle,
              ]}
            />
          </Animated.View>
        )}
      </Animated.View>
      </Animated.View>
    </GestureDetector>
  );
}
