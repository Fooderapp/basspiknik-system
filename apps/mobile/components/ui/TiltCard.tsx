"use client";
import { useEffect, useRef, useState } from "react";
import { View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  useDerivedValue,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { DeviceMotion } from "expo-sensors";
import Svg, { Defs, LinearGradient, Stop, Rect } from "react-native-svg";

interface Props {
  children: React.ReactNode;
  maxTilt?: number;
  gyro?: boolean;
  pan?: boolean;
  holo?: boolean;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}

const clampJS = (v: number, m: number) => Math.max(-m, Math.min(m, v));

/**
 * Apple-Wallet / holographic foil card.
 *
 * Matches the van123helsing/react-holo-card-effect repo:
 *  – Band 1: teal→gold linear gradient that shifts with tilt (repo's :before)
 *  – Band 2: rainbow spectrum overlay (repo's :after)
 *  – Specular white streak (repo's box-shadow / glare)
 *
 * Uses react-native-svg for real linear gradients with transparent stops
 * (approximates CSS mix-blend-mode:color-dodge without a native blend layer).
 * The SVG wrapper translates with tilt so the gradient position tracks the
 * card orientation — matching the `background-position: lp% tp%` logic.
 */
export function TiltCard({
  children,
  maxTilt = 8,
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
  // JS-thread tilt values for SVG props (SVG can't be driven directly from worklet)
  const [tilt, setTilt] = useState({ rx: 0, ry: 0, mag: 0 });

  const updateTilt = (rx: number, ry: number) => {
    const mag = (Math.abs(rx) + Math.abs(ry)) / maxTilt;
    setTilt({ rx, ry, mag });
  };

  // Bridge worklet→JS every frame for the SVG overlay position
  useDerivedValue(() => {
    const rx = Math.max(-maxTilt, Math.min(maxTilt, gRx.value + pRx.value));
    const ry = Math.max(-maxTilt, Math.min(maxTilt, gRy.value + pRy.value));
    runOnJS(updateTilt)(rx, ry);
  });

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
      // suppress iOS implicit CALayer shadow on 3D-transformed views
      shadowColor: "transparent",
      shadowOpacity: 0,
      shadowRadius: 0,
      elevation: 0,
    };
  });

  function onLayout(e: LayoutChangeEvent) {
    const { width, height } = e.nativeEvent.layout;
    setSize((s) => (s.w === width && s.h === height ? s : { w: width, h: height }));
  }

  // Gradient position: maps tilt [-maxTilt,maxTilt] → [0%,100%] for each axis
  // (matches the repo's lp/tp background-position calculation)
  const lp = 50 + (tilt.ry / maxTilt) * 33;  // 17%…83%
  const tp = 50 - (tilt.rx / maxTilt) * 33;

  // x1/y1 = gradient origin, x2/y2 = gradient end (SVG user-space percentages)
  // Diagonal band that shifts position with tilt
  const gx1 = `${lp - 30}%`;
  const gy1 = `${tp - 30}%`;
  const gx2 = `${lp + 70}%`;
  const gy2 = `${tp + 70}%`;

  // Specular: translates across card on ry axis
  const specX = interpolate(tilt.ry, [-maxTilt, maxTilt], [-size.w * 0.6, size.w * 1.1]);
  const specOpacity = Math.min(0.55, 0.08 + tilt.mag * 0.5);
  const holoOpacity = Math.min(0.85, 0.25 + tilt.mag * 0.65);

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View onLayout={onLayout} style={[cardStyle, style]}>
        {children}

        {holo && size.w > 0 && (
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              left: 0, top: 0,
              width: size.w, height: size.h,
              borderRadius: radius,
              overflow: "hidden",
            }}
          >
            {/* ── Band 1: teal/gold diagonal (repo :before) ── */}
            <Svg
              width={size.w}
              height={size.h}
              style={{ position: "absolute", opacity: holoOpacity }}
            >
              <Defs>
                <LinearGradient id="holo_band" x1={gx1} y1={gy1} x2={gx2} y2={gy2}>
                  <Stop offset="0%"   stopColor="transparent"  stopOpacity="0" />
                  <Stop offset="25%"  stopColor="#54a29e"       stopOpacity="0.9" />
                  <Stop offset="47%"  stopColor="transparent"   stopOpacity="0" />
                  <Stop offset="53%"  stopColor="transparent"   stopOpacity="0" />
                  <Stop offset="75%"  stopColor="#a79d66"       stopOpacity="0.9" />
                  <Stop offset="100%" stopColor="transparent"   stopOpacity="0" />
                </LinearGradient>
              </Defs>
              <Rect width={size.w} height={size.h} fill="url(#holo_band)" />
            </Svg>

            {/* ── Band 2: rainbow spectrum (repo :after) ── */}
            <Svg
              width={size.w}
              height={size.h}
              style={{ position: "absolute", opacity: Math.min(0.75, 0.18 + tilt.mag * 0.6) }}
            >
              <Defs>
                <LinearGradient id="holo_rainbow" x1="0%" y1="0%" x2="100%" y2="100%">
                  <Stop offset="0%"   stopColor="#ff0084"  stopOpacity="0.7" />
                  <Stop offset="15%"  stopColor="#fca400"  stopOpacity="0.6" />
                  <Stop offset="30%"  stopColor="#ffff00"  stopOpacity="0.5" />
                  <Stop offset="50%"  stopColor="#00ff8a"  stopOpacity="0.5" />
                  <Stop offset="70%"  stopColor="#00cfff"  stopOpacity="0.6" />
                  <Stop offset="85%"  stopColor="#cc4cfa"  stopOpacity="0.7" />
                  <Stop offset="100%" stopColor="#ff0084"  stopOpacity="0.7" />
                </LinearGradient>
              </Defs>
              <Rect width={size.w} height={size.h} fill="url(#holo_rainbow)" />
            </Svg>

            {/* ── Specular glare sweep (repo's box-shadow glow) ── */}
            <View
              style={{
                position: "absolute",
                top: -size.h * 0.3,
                bottom: -size.h * 0.3,
                left: 0,
                width: size.w * 0.45,
                backgroundColor: "#ffffff",
                opacity: specOpacity,
                transform: [{ translateX: specX }, { rotate: "18deg" }],
              }}
            />
          </View>
        )}
      </Animated.View>
    </GestureDetector>
  );
}
