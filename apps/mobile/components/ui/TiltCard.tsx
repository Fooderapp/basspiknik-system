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
  maxTilt?: number;
  gyro?: boolean;
  pan?: boolean;
  holo?: boolean;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}

const clampJS = (v: number, m: number) => Math.max(-m, Math.min(m, v));

// iridescent foil colours — bold, repeating rainbow band
const HOLO_COLORS = [
  "#ff0055", "#ff5500", "#ffcc00",
  "#00ff88", "#00ccff", "#8800ff",
  "#ff0055", "#ff5500", "#ffcc00",
  "#00ff88", "#00ccff", "#8800ff",
];

export function TiltCard({
  children,
  maxTilt = 8,           // reduced — less edge exposure on dark bg
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
      // suppress iOS implicit compositing-layer shadow on 3D-transformed views
      shadowColor: "transparent",
      shadowOpacity: 0,
      shadowRadius: 0,
    };
  });

  // Holo bands: vivid rainbow that sweeps visibly with tilt
  const holoBandsStyle = useAnimatedStyle(() => {
    const rx = gRx.value + pRx.value;
    const ry = gRy.value + pRy.value;
    const mag = (Math.abs(rx) + Math.abs(ry)) / maxTilt;
    return {
      opacity: Math.min(0.72, 0.22 + mag * 0.55),
      transform: [
        { translateX: ry * 5 },
        { translateY: rx * 5 },
        { rotate: "25deg" },
      ],
    };
  });

  // Bright specular glare that sweeps left↔right with tilt
  const specularStyle = useAnimatedStyle(() => {
    const rx = gRx.value + pRx.value;
    const ry = gRy.value + pRy.value;
    const mag = (Math.abs(rx) + Math.abs(ry)) / maxTilt;
    return {
      opacity: Math.min(0.55, 0.1 + mag * 0.45),
      transform: [
        { translateX: interpolate(ry, [-maxTilt, maxTilt], [-size.w * 0.6, size.w * 1.1]) },
        { rotate: "20deg" },
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
            style={{
              position: "absolute",
              left: 0, top: 0,
              width: size.w, height: size.h,
              borderRadius: radius,
              overflow: "hidden",
            }}
          >
            {/* Rainbow foil bands */}
            <Animated.View
              style={[
                {
                  position: "absolute",
                  left: -size.w * 0.4,
                  top: -size.h * 0.6,
                  width: size.w * 1.8,
                  height: size.h * 2.2,
                },
                holoBandsStyle,
              ]}
            >
              {HOLO_COLORS.map((c, i) => (
                <View
                  key={i}
                  style={{ height: 22, marginBottom: 8, backgroundColor: c, opacity: 0.75 }}
                />
              ))}
            </Animated.View>
            {/* Bright specular highlight streak */}
            <Animated.View
              style={[
                {
                  position: "absolute",
                  top: -size.h * 0.3,
                  bottom: -size.h * 0.3,
                  width: size.w * 0.5,
                  backgroundColor: "#ffffff",
                },
                specularStyle,
              ]}
            />
          </View>
        )}
      </Animated.View>
    </GestureDetector>
  );
}
