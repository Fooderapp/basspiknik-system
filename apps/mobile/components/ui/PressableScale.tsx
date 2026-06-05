import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface Props extends PressableProps {
  /** scale at full press */
  pressedScale?: number;
  style?: StyleProp<ViewStyle>;
}

/** Pressable that springs down on touch — universal tactile micro-interaction. */
export function PressableScale({ pressedScale = 0.96, style, children, ...rest }: Props) {
  const scale = useSharedValue(1);
  const aStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <AnimatedPressable
      {...rest}
      onPressIn={(e) => {
        scale.value = withSpring(pressedScale, { stiffness: 400, damping: 22 });
        rest.onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.value = withSpring(1, { stiffness: 320, damping: 18 });
        rest.onPressOut?.(e);
      }}
      style={[aStyle, style]}
    >
      {children as React.ReactNode}
    </AnimatedPressable>
  );
}
