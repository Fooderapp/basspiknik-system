import { useEffect } from "react";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { Star } from "lucide-react-native";

/** A continuously flipping 3D credit coin (rotateY + perspective + edge squash). */
export function CreditCoin({ size = 32, duration = 2800 }: { size?: number; duration?: number }) {
  const spin = useSharedValue(0);

  useEffect(() => {
    spin.value = withRepeat(withTiming(360, { duration, easing: Easing.linear }), -1, false);
  }, [spin, duration]);

  const style = useAnimatedStyle(() => {
    const rad = (spin.value * Math.PI) / 180;
    const cos = Math.cos(rad);
    return {
      transform: [
        { perspective: 140 },
        { rotateY: `${spin.value}deg` },
        // squash toward the edge so it reads as a spinning coin
        { scaleX: Math.max(0.12, Math.abs(cos)) },
      ],
    };
  });

  return (
    <Animated.View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#f59e0b",
          borderWidth: 1.5,
          borderColor: "#fbbf24",
          shadowColor: "#f59e0b",
          shadowOpacity: 0.55,
          shadowRadius: 6,
          shadowOffset: { width: 0, height: 2 },
          elevation: 4,
        },
        style,
      ]}
    >
      <Star size={size * 0.5} color="#000" strokeWidth={2} fill="#000" />
    </Animated.View>
  );
}
