import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { ChevronsRight, Check } from "lucide-react-native";
import { Text } from "@/components/ui/text";

const THUMB = 52;
const PAD = 4;
const TRACK_H = THUMB + PAD * 2;

interface SlideToConfirmProps {
  label: string;
  confirmedLabel?: string;
  /** Called once the thumb is dragged to the end. Return a promise to show a spinner. */
  onConfirm: () => void | Promise<void>;
  disabled?: boolean;
  /** Keep the thumb pinned at the end + show confirmedLabel after onConfirm resolves.
   *  Set false for actions that may be cancelled (e.g. payment sheet) so it springs back. */
  lockOnConfirm?: boolean;
  /** Accent color of the filled track + thumb. */
  color?: string;
  /** Text/icon color rendered on top of `color`. */
  onColor?: string;
  icon?: React.ReactNode;
}

/**
 * Drag-to-confirm pill. Replaces a destructive/irreversible tap with a
 * deliberate horizontal swipe — "Slide to sell / buy / fulfill".
 * Pure reanimated + gesture-handler, no native deps.
 */
export function SlideToConfirm({
  label,
  confirmedLabel = "Done",
  onConfirm,
  disabled = false,
  lockOnConfirm = true,
  color = "#22c55e",
  onColor = "#000000",
  icon,
}: SlideToConfirmProps) {
  const [trackW, setTrackW] = useState(0);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const x = useSharedValue(0);
  const shimmer = useSharedValue(0);

  const maxX = Math.max(0, trackW - THUMB - PAD * 2);

  // ── label shimmer loop ──
  useEffect(() => {
    if (disabled) return;
    shimmer.value = 0;
    shimmer.value = withRepeat(withTiming(1, { duration: 1600, easing: Easing.linear }), -1, false);
  }, [disabled, shimmer]);

  const fire = async () => {
    setBusy(true);
    try {
      await onConfirm();
      if (lockOnConfirm) {
        setDone(true);
      } else {
        x.value = withSpring(0, { damping: 18, stiffness: 180 });
      }
    } catch {
      // reset on failure
      x.value = withSpring(0, { damping: 18, stiffness: 180 });
    } finally {
      setBusy(false);
    }
  };

  const pan = Gesture.Pan()
    .enabled(!disabled && !busy && !done)
    .onUpdate((e) => {
      x.value = Math.min(maxX, Math.max(0, e.translationX));
    })
    .onEnd(() => {
      if (x.value > maxX * 0.85) {
        x.value = withTiming(maxX, { duration: 120 });
        runOnJS(fire)();
      } else {
        x.value = withSpring(0, { damping: 18, stiffness: 180 });
      }
    });

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }],
  }));

  const fillStyle = useAnimatedStyle(() => ({
    width: x.value + THUMB + PAD * 2,
  }));

  const labelStyle = useAnimatedStyle(() => {
    const progress = maxX > 0 ? x.value / maxX : 0;
    return {
      opacity: interpolate(progress, [0, 0.6], [1, 0]),
    };
  });

  const shimmerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(shimmer.value, [0, 1], [-80, trackW || 0]) }],
  }));

  return (
    <View
      onLayout={(e) => setTrackW(e.nativeEvent.layout.width)}
      style={[styles.track, { height: TRACK_H, opacity: disabled ? 0.4 : 1 }]}
    >
      {/* progress fill */}
      <Animated.View style={[styles.fill, fillStyle, { backgroundColor: color }]} />

      {/* centered label + shimmer (hidden once done) */}
      {!done && (
        <Animated.View style={[StyleSheet.absoluteFill, styles.center, labelStyle]} pointerEvents="none">
          <Text style={{ color: "#fafafa" }} className="font-semibold text-base">
            {label}
          </Text>
          <Animated.View style={[styles.shimmer, shimmerStyle]} pointerEvents="none" />
        </Animated.View>
      )}

      {/* confirmed label */}
      {done && (
        <View style={[StyleSheet.absoluteFill, styles.center]} pointerEvents="none">
          <Text style={{ color: onColor }} className="font-bold text-base">
            {confirmedLabel}
          </Text>
        </View>
      )}

      {/* thumb */}
      <GestureDetector gesture={pan}>
        <Animated.View style={[styles.thumb, thumbStyle, { backgroundColor: color }]}>
          {busy ? (
            <ActivityIndicator size="small" color={onColor} />
          ) : done ? (
            <Check size={24} color={onColor} strokeWidth={2.5} />
          ) : (
            icon ?? <ChevronsRight size={24} color={onColor} strokeWidth={2.5} />
          )}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    width: "100%",
    borderRadius: TRACK_H / 2,
    backgroundColor: "#1c1c1e",
    borderWidth: 1,
    borderColor: "#2c2c2e",
    justifyContent: "center",
    overflow: "hidden",
  },
  fill: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: TRACK_H / 2,
    opacity: 0.25,
  },
  center: { alignItems: "center", justifyContent: "center" },
  thumb: {
    position: "absolute",
    left: PAD,
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  shimmer: {
    position: "absolute",
    width: 60,
    top: 0,
    bottom: 0,
    backgroundColor: "rgba(255,255,255,0.06)",
    transform: [{ skewX: "-20deg" }],
  },
});
