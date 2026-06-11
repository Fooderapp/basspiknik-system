import { View, type StyleProp, type ViewStyle } from "react-native";
import type { LucideIcon } from "lucide-react-native";
import { PressableScale } from "@/components/ui/PressableScale";
import { Text } from "@/components/ui/text";

// Brand-tinted pastel tones (mirror tailwind.config.js `pastel.*`).
export type PastelTone = "green" | "gold" | "sky" | "peach" | "lavender" | "rose";

const TONE: Record<PastelTone, { bg: string; ink: string }> = {
  green:    { bg: "#DDF2C6", ink: "#2C3A18" },
  gold:     { bg: "#F7EFC0", ink: "#3A3608" },
  sky:      { bg: "#D6E7F5", ink: "#15324A" },
  peach:    { bg: "#F8DEC2", ink: "#4A2E12" },
  lavender: { bg: "#E7DFF6", ink: "#2E2350" },
  rose:     { bg: "#F6D9DE", ink: "#4A1820" },
};

interface Props {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  tone: PastelTone;
  onPress?: () => void;
  /** big = tall quadrant tile, compact = short row tile */
  size?: "big" | "compact";
  style?: StyleProp<ViewStyle>;
}

/**
 * Pastel quadrant action card from the scanner-app mock: soft pastel fill,
 * white circular icon chip, ink title + subtitle. Springs on press.
 */
export function ActionCard({ icon: Icon, title, subtitle, tone, onPress, size = "big", style }: Props) {
  const t = TONE[tone];
  const big = size === "big";

  return (
    <PressableScale pressedScale={0.96} onPress={onPress} style={style}>
      <View
        style={{
          backgroundColor: t.bg,
          borderRadius: 26,
          padding: big ? 18 : 16,
          minHeight: big ? 132 : 0,
          justifyContent: "space-between",
          shadowColor: "#14160F",
          shadowOpacity: 0.05,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 2 },
        }}
      >
        <View
          style={{
            width: 44, height: 44, borderRadius: 22, backgroundColor: "#fff",
            alignItems: "center", justifyContent: "center",
            shadowColor: "#14160F", shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 1 },
            ...(big ? {} : { marginBottom: 10 }),
          }}
        >
          <Icon size={22} color={t.ink} strokeWidth={2} />
        </View>

        <View style={big ? { marginTop: 14 } : undefined}>
          <Text style={{ color: t.ink, fontSize: big ? 19 : 16, fontWeight: "800", letterSpacing: -0.3 }}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={{ color: t.ink, opacity: 0.6, fontSize: 12, marginTop: 2 }} numberOfLines={2}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      </View>
    </PressableScale>
  );
}
