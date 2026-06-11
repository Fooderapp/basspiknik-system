import { View, type StyleProp, type ViewStyle } from "react-native";
import type { LucideIcon } from "lucide-react-native";
import { PressableScale } from "@/components/ui/PressableScale";

type Variant = "white" | "dark" | "cream";

const VARIANT: Record<Variant, { bg: string; ink: string }> = {
  white: { bg: "#FFFFFF", ink: "#14160F" },
  dark:  { bg: "#16170F", ink: "#FFFFFF" },
  cream: { bg: "#ECEADD", ink: "#14160F" },
};

interface Props {
  icon: LucideIcon;
  onPress?: () => void;
  variant?: Variant;
  /** diameter in px */
  size?: number;
  iconSize?: number;
  /** override icon color (e.g. notification accent) */
  color?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * Circular icon button from the mock — white pill with a soft shadow by
 * default; `dark` for the focal/scan button, `cream` for secondary chips.
 */
export function IconButton({ icon: Icon, onPress, variant = "white", size = 48, iconSize, color, style }: Props) {
  const v = VARIANT[variant];
  return (
    <PressableScale pressedScale={0.92} onPress={onPress} style={style}>
      <View
        style={{
          width: size, height: size, borderRadius: size / 2,
          backgroundColor: v.bg, alignItems: "center", justifyContent: "center",
          shadowColor: "#14160F", shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
        }}
      >
        <Icon size={iconSize ?? Math.round(size * 0.42)} color={color ?? v.ink} strokeWidth={2} />
      </View>
    </PressableScale>
  );
}
