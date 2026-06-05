import { useEffect, useRef, useState } from "react";
import { View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from "react-native";
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
  /** max tilt in degrees on each axis */
  maxTilt?: number;
  /** ambient gyroscope tilt (device motion) */
  gyro?: boolean;
  /** drag-to-tilt with finger */
  pan?: boolean;
  /** holographic light sheen that reacts to tilt (Apple-Wallet / foil look) */
  holo?: boolean;
  /** corner radius of the holo clip (match the child) */
  radius?: number;
  style?: StyleProp<ViewStyle>;
}

const clampJS = (v: number, m: number) => Math.max(-m, Math.min(m, v));

// iridescent band colours, cycled to make a foil/hologram gradient
const HOLO_COLORS = ["#ff3d81", "#ff9a3d", "#ffe23d", "#3dff9e", "#3dc9ff", "#b03dff"];
const HOLO_BARS = Array.from({ length: 28 }, (_, i) => HOLO_COLORS[i % HOLO_COLORS.length]);

/**
 * Wallet-style 3D tilt card. Reacts to device gyroscope (ambient) and/or
 * finger drag. Faux-3D via perspective + rotateX/rotateY (no preserve-3d in
 * RN). Depth/sheen comes from a holographic foil overlay that sweeps and
 * brightens as the card tilts — built from plain Views (no gradient lib).
 */
export function TiltCard({
  children,
  maxTilt = 12,
  gyro = true,
  pan = true,
  holo = true,
  radius = 24,
  style,
}: Props) {
  const gRx = useSharedValue(0);
  const gRy = useSharedValue(0);
  const pRx = useSharedValue(0);
  const pRy = useSharedValue(0);

  const rest = useRef<{ beta: number; gamma: number } | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    if (!gyro) return;
    DeviceMotion.setUpdateInterval(50);
    const sub = DeviceMotion.addListener(({ rotation }) => {
      if (!rotation) return;
      const beta = (rotation.beta * 180) / Math.PI;
      const gamma = (rotation.gamma * 180) / Math.PI;
      if (!rest.current) rest.current = { beta, gamma };
      gRx.value = withTiming(clampJS(-(beta - rest.current.beta) / 2.2, maxTilt), { duration: 120 });
      gRy.value = withTiming(clampJS((gamma - rest.current.gamma) / 2.2, maxTilt), { duration: 120 });
    });
    return () => sub.remove();
  }, [gyro, maxTilt, gRx, gRy]);

  const panGesture = Gesture.Pan()
    .enabled(pan)
    .onUpdate((e) => {
      "worklet";
      pRx.value = Math.max(-maxTilt, Math.min(maxTilt, -e.translationY / 9));
      pRy.value = Math.max(-maxTilt, Math.min(maxTilt, e.translationX / 9));
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
    };
  });

  // foil bands sweep with tilt — kept faint so underlying content (QR) stays
  // readable; brightness rides tilt magnitude like the holo-card glare
  const holoBandsStyle = useAnimatedStyle(() => {
    const rx = gRx.value + pRx.value;
    const ry = gRy.value + pRy.value;
    const mag = (Math.abs(rx) + Math.abs(ry)) / maxTilt;
    return {
      opacity: Math.min(0.32, 0.08 + mag * 0.22),
      transform: [
        { translateX: ry * 3.2 },
        { translateY: rx * 3.2 },
        { rotate: "22deg" },
      ],
    };
  });
  // bright specular glare that glides across as you tilt left↔right
  const specularStyle = useAnimatedStyle(() => {
    const rx = gRx.value + pRx.value;
    const ry = gRy.value + pRy.value;
    const mag = (Math.abs(rx) + Math.abs(ry)) / maxTilt;
    return {
      opacity: Math.min(0.3, 0.06 + mag * 0.2),
      transform: [
        { translateX: interpolate(ry, [-maxTilt, maxTilt], [-size.w * 0.7, size.w * 1.2]) },
        { rotate: "18deg" },
      ],
    };
  });

  function onLayout(e: LayoutChangeEvent) {
    const { width, height } = e.nativeEvent.layout;
    setSize((s) => (s.w === width && s.h === height ? s : { w: width, h: height }));
  }

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View onLayout={onLayout} style={[cardStyle, style]}>
        {children}
        {holo && size.w > 0 && (
          <View
            pointerEvents="none"
            style={{ position: "absolute", left: 0, top: 0, width: size.w, height: size.h, borderRadius: radius, overflow: "hidden" }}
          >
            <Animated.View
              style={[
                { position: "absolute", left: -size.w * 0.5, top: -size.h * 0.7, width: size.w * 2, height: size.h * 2.4 },
                holoBandsStyle,
              ]}
            >
              {HOLO_BARS.map((c, i) => (
                <View key={i} style={{ height: 14, marginBottom: 16, backgroundColor: c, opacity: 0.45 }} />
              ))}
            </Animated.View>
            <Animated.View
              style={[
                { position: "absolute", top: -size.h * 0.4, bottom: -size.h * 0.4, width: size.w * 0.45, backgroundColor: "#ffffff" },
                specularStyle,
              ]}
            />
          </View>
        )}
      </Animated.View>
    </GestureDetector>
  );
}
