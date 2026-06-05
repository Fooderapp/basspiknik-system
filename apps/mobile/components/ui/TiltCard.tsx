import { useEffect, useRef } from "react";
import type { StyleProp, ViewStyle } from "react-native";
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
  /** drop shadow that lifts the card off the background */
  shadow?: boolean;
  style?: StyleProp<ViewStyle>;
}

const clampJS = (v: number, m: number) => Math.max(-m, Math.min(m, v));

/**
 * Wallet-style 3D tilt card. Reacts to device gyroscope (ambient) and/or
 * finger drag, with an optional specular glare sweep. Faux-3D via
 * perspective + rotateX/rotateY (no preserve-3d in RN).
 */
export function TiltCard({
  children,
  maxTilt = 12,
  gyro = true,
  pan = true,
  shadow = true,
  style,
}: Props) {
  // gyro-driven rotation (degrees)
  const gRx = useSharedValue(0);
  const gRy = useSharedValue(0);
  // pan-driven rotation (degrees)
  const pRx = useSharedValue(0);
  const pRy = useSharedValue(0);

  const rest = useRef<{ beta: number; gamma: number } | null>(null);

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
      // tilt ~1/3 of the device delta, clamped
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
    // shadow drifts opposite the tilt → the card reads as lifted off the bg
    return {
      transform: [
        { perspective: 1200 },
        { rotateX: `${rx}deg` },
        { rotateY: `${ry}deg` },
      ],
      shadowOffset: shadow ? { width: -ry * 1.2, height: 14 - rx * 1.2 } : { width: 0, height: 0 },
    };
  });

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View
        style={[
          shadow && {
            shadowColor: "#000",
            shadowOpacity: 0.45,
            shadowRadius: 22,
            elevation: 16,
          },
          cardStyle,
          style,
        ]}
      >
        {children}
      </Animated.View>
    </GestureDetector>
  );
}
