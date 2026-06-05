import { useEffect, useRef, useState } from "react";
import { View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
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
  /** cast-shadow plate behind the card for real depth */
  shadow?: boolean;
  /** corner radius of the shadow plate (match the child) */
  radius?: number;
  style?: StyleProp<ViewStyle>;
}

const clampJS = (v: number, m: number) => Math.max(-m, Math.min(m, v));

/**
 * Wallet-style 3D tilt card. Reacts to device gyroscope (ambient) and/or
 * finger drag. Faux-3D via perspective + rotateX/rotateY (no preserve-3d in
 * RN). Depth comes from a SEPARATE shadow plate rendered behind the card —
 * attaching a layer shadow to the rotated card itself makes the shadow tilt
 * in-plane and mask the content, which is wrong.
 */
export function TiltCard({
  children,
  maxTilt = 12,
  gyro = true,
  pan = true,
  shadow = true,
  radius = 24,
  style,
}: Props) {
  // gyro-driven rotation (degrees)
  const gRx = useSharedValue(0);
  const gRy = useSharedValue(0);
  // pan-driven rotation (degrees)
  const pRx = useSharedValue(0);
  const pRy = useSharedValue(0);

  const rest = useRef<{ beta: number; gamma: number } | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    if (!gyro) return;
    DeviceMotion.setUpdateInterval(50);
    const sub = DeviceMotion.addListener(({ rotation }) => {
      if (!rotation) return;
      const beta = (rotation.beta * 180) / Math.PI; // front/back
      const gamma = (rotation.gamma * 180) / Math.PI; // left/right
      if (!rest.current) rest.current = { beta, gamma };
      const dBeta = beta - rest.current.beta;
      const dGamma = gamma - rest.current.gamma;
      gRx.value = withTiming(clampJS(-dBeta / 2.2, maxTilt), { duration: 120 });
      gRy.value = withTiming(clampJS(dGamma / 2.2, maxTilt), { duration: 120 });
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

  // Shadow plate: sits behind + below the card, shifts opposite the tilt so the
  // card visibly hovers above it. Its own soft layer shadow does the blur.
  const plateStyle = useAnimatedStyle(() => {
    const rx = gRx.value + pRx.value;
    const ry = gRy.value + pRy.value;
    const mag = (Math.abs(rx) + Math.abs(ry)) / maxTilt; // 0..~2
    return {
      opacity: 0.32 + Math.min(0.28, mag * 0.16),
      transform: [
        { translateX: -ry * 1.6 },
        { translateY: 18 - rx * 1.6 },
        { scale: 0.94 },
      ],
    };
  });

  function onLayout(e: LayoutChangeEvent) {
    const { width, height } = e.nativeEvent.layout;
    setSize((s) => (s.w === width && s.h === height ? s : { w: width, h: height }));
  }

  return (
    <GestureDetector gesture={panGesture}>
      <View>
        {shadow && size.w > 0 && (
          <Animated.View
            pointerEvents="none"
            style={[
              {
                position: "absolute",
                width: size.w,
                height: size.h,
                borderRadius: radius,
                backgroundColor: "#000",
                shadowColor: "#000",
                shadowOpacity: 0.9,
                shadowRadius: 24,
                shadowOffset: { width: 0, height: 10 },
                elevation: 12,
              },
              plateStyle,
            ]}
          />
        )}
        <Animated.View onLayout={onLayout} style={[cardStyle, style]}>
          {children}
        </Animated.View>
      </View>
    </GestureDetector>
  );
}
