import { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  runOnJS,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { Sparkles, X, Star, Info } from "lucide-react-native";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/Button";

// Ordered so 7️⃣ is the jackpot symbol — always last
const REEL = ["🍒", "🍋", "🔔", "🍇", "⭐", "💎", "7️⃣"];
const JACKPOT = REEL.length - 1;

// ── 3D cylinder geometry ──
const N = REEL.length;
const CELL_H = 72;
const STEP = 360 / N;                                  // angle between faces
const RADIUS = CELL_H / 2 / Math.tan(Math.PI / N);     // drum radius
const PERSPECTIVE = 700;
const FRAME_H = CELL_H * 2.7;

type Phase = "idle" | "spinning" | "win" | "lose";

interface SpinModalProps {
  visible: boolean;
  balance: number;
  spinCost: number;
  result: { win: boolean; token?: string; balance?: number } | null;
  spinning: boolean;
  onSpin: () => void;
  onClose: () => void;
  onClaim: (token: string) => void;
}

/** One face of the spinning drum. Builds its full 3D transform from the shared
 *  rotation — RN has no preserve-3d, so each face is positioned independently. */
function ReelFace({
  symbol,
  index,
  rotation,
  win,
}: {
  symbol: string;
  index: number;
  rotation: SharedValue<number>;
  win: boolean;
}) {
  // RN has no translateZ — emulate the cylinder with translateY (position on
  // the drum), rotateX (face tilt) and scale (depth foreshortening).
  const style = useAnimatedStyle(() => {
    const angle = rotation.value + index * STEP;
    const rad = (angle * Math.PI) / 180;
    const facing = Math.cos(rad);               // 1 = front, -1 = back
    const translateY = -RADIUS * Math.sin(rad);
    const scale = interpolate(facing, [-1, 0, 1], [0.55, 0.75, 1]);
    return {
      opacity: facing > 0.05 ? facing : 0,      // hide back faces
      transform: [
        { perspective: PERSPECTIVE },
        { translateY },
        { rotateX: `${angle}deg` },
        { scale },
      ],
    };
  });

  return (
    <Animated.View style={[styles.face, style]} pointerEvents="none">
      <Text style={{ fontSize: 40, color: win ? "#fbbf24" : "#fafafa" }}>{symbol}</Text>
    </Animated.View>
  );
}

export function SpinModal({ visible, balance, spinCost, result, spinning, onSpin, onClose, onClaim }: SpinModalProps) {
  // rotation in degrees; decreasing = drum spins "up"
  const rotation = useSharedValue(0);
  const glow = useSharedValue(0);
  const [phaseState, setPhaseState] = useState<Phase>("idle");

  // bring REEL[target] to the front: rotation ≡ -target*STEP (mod 360)
  function landingRotation(target: number, fromValue: number) {
    const base = -target * STEP;
    // add full spins beyond current so it always rotates a few turns
    const turns = 4;
    let final = base - 360 * turns;
    while (final > fromValue) final -= 360;
    return final;
  }

  // Start continuous spin when the request fires
  useEffect(() => {
    if (!spinning) return;
    setPhaseState("spinning");
    glow.value = 0;
    cancelAnimation(rotation);
    rotation.value = withRepeat(
      withTiming(rotation.value - 360, { duration: 550, easing: Easing.linear }),
      -1,
      false,
    );
  }, [spinning]);

  // Settle on result
  useEffect(() => {
    if (!result) return;
    cancelAnimation(rotation);
    const target = result.win ? JACKPOT : pickLoser();
    const final = landingRotation(target, rotation.value);
    rotation.value = withTiming(
      final,
      { duration: 2400, easing: Easing.bezier(0.16, 0.9, 0.2, 1) },
      (finished) => {
        if (finished) runOnJS(setPhaseState)(result.win ? "win" : "lose");
      },
    );
    if (result.win) {
      glow.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 600, easing: Easing.inOut(Easing.ease) }),
          withTiming(0.4, { duration: 600, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        true,
      );
    }
  }, [result]);

  // Reset on close
  useEffect(() => {
    if (!visible) {
      cancelAnimation(rotation);
      cancelAnimation(glow);
      rotation.value = 0;
      glow.value = 0;
      setPhaseState("idle");
    }
  }, [visible]);

  const currentBalance = result?.balance ?? balance;
  const canSpin = currentBalance >= spinCost && phaseState === "idle";
  const isWin = phaseState === "win";

  const glowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(glow.value, [0, 1], [0, 0.9]),
    shadowOpacity: interpolate(glow.value, [0, 1], [0, 0.9]),
  }));

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View className="flex-1 bg-background">
        {/* Header */}
        <View className="flex-row items-center justify-between px-5 pt-5 pb-3">
          <View className="flex-row items-center gap-2">
            <View className="w-9 h-9 rounded-xl items-center justify-center bg-primary">
              <Sparkles size={18} color="#000" strokeWidth={2} />
            </View>
            <Text className="text-foreground font-bold text-xl tracking-tight">Lucky Spin</Text>
          </View>
          <Pressable onPress={onClose} className="active:opacity-60 p-1">
            <X size={22} color="#8f8f8f" strokeWidth={2} />
          </Pressable>
        </View>

        {/* Win-hint */}
        <View className="flex-row items-center gap-2 mx-5 mb-6 px-3 py-2.5 rounded-xl border border-border bg-muted">
          <Info size={14} color="#8f8f8f" strokeWidth={1.75} />
          <Text className="text-muted-foreground text-sm flex-1">
            Land on <Text className="text-foreground font-semibold">7️⃣</Text> to win a{" "}
            <Text className="text-foreground font-semibold">completely free checkout</Text> — no payment needed.
          </Text>
        </View>

        {/* 3D drum */}
        <View className="items-center mb-6">
          <Animated.View style={[styles.drumGlow, glowStyle]} pointerEvents="none" />
          <View style={styles.frame}>
            {REEL.map((sym, i) => (
              <ReelFace key={i} symbol={sym} index={i} rotation={rotation} win={isWin} />
            ))}
            {/* payline window */}
            <View style={styles.payline} pointerEvents="none" />
            {/* top/bottom shade for depth */}
            <View style={styles.shadeTop} pointerEvents="none" />
            <View style={styles.shadeBottom} pointerEvents="none" />
          </View>
          <View className="flex-row items-center gap-2 mt-2">
            <Text className="text-primary text-xs font-semibold">▶ payline ◀</Text>
          </View>
        </View>

        {/* Phase message */}
        {phaseState !== "idle" && (
          <Text className={`text-center font-semibold text-base mb-4 px-6 ${
            isWin ? "text-amber-400" :
            phaseState === "lose" ? "text-muted-foreground" :
            "text-foreground"
          }`}>
            {isWin ? "🎉 Jackpot! Free checkout unlocked!" :
             phaseState === "lose" ? "Not this time — keep collecting credits!" :
             "Good luck…"}
          </Text>
        )}

        {/* Balance */}
        <View className="flex-row items-center justify-center gap-1.5 mb-8">
          <Star size={14} color="#fbbf24" strokeWidth={2} fill="#fbbf24" />
          <Text className="text-muted-foreground text-sm">
            <Text className="text-foreground font-semibold">{currentBalance}</Text> credits remaining
          </Text>
        </View>

        {/* Actions */}
        <View className="px-5 gap-3">
          {phaseState === "idle" && (
            <Button
              onPress={onSpin}
              disabled={!canSpin}
              style={canSpin ? { backgroundColor: "#f59e0b" } : undefined}
              icon={<Sparkles size={16} color={canSpin ? "#000" : "#8f8f8f"} strokeWidth={2} />}
            >
              <Text className={`font-semibold ${canSpin ? "text-black" : "text-muted-foreground"}`}>
                {canSpin ? `Spin! · ${spinCost} credits` : `Need ${spinCost} credits to spin`}
              </Text>
            </Button>
          )}

          {isWin && result?.token && (
            <Button
              style={{ backgroundColor: "#f59e0b" }}
              onPress={() => onClaim(result.token!)}
              icon={<Sparkles size={16} color="#000" strokeWidth={2} />}
            >
              <Text className="font-semibold text-black">🎟 Claim free tickets!</Text>
            </Button>
          )}

          {phaseState === "lose" && (
            <Button
              onPress={onSpin}
              disabled={currentBalance < spinCost}
              variant="secondary"
              icon={<Sparkles size={16} color="#fafafa" strokeWidth={2} />}
            >
              <Text className="font-semibold">
                {currentBalance >= spinCost ? `Spin again · ${spinCost} credits` : "Not enough credits"}
              </Text>
            </Button>
          )}

          <Button variant="ghost" onPress={onClose}>
            <Text className="text-muted-foreground">
              {isWin ? "Skip — pay normally" : "Close"}
            </Text>
          </Button>
        </View>
      </View>
    </Modal>
  );
}

function pickLoser(): number {
  return Math.floor(Math.random() * (REEL.length - 1)); // excludes JACKPOT
}

const styles = StyleSheet.create({
  frame: {
    width: 150,
    height: FRAME_H,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: "#2c2c2e",
    backgroundColor: "#0e0e10",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  face: {
    position: "absolute",
    width: 150,
    height: CELL_H,
    alignItems: "center",
    justifyContent: "center",
    backfaceVisibility: "hidden",
  },
  payline: {
    position: "absolute",
    left: 0,
    right: 0,
    top: FRAME_H / 2 - CELL_H / 2,
    height: CELL_H,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "rgba(245,158,11,0.45)",
    backgroundColor: "rgba(245,158,11,0.05)",
  },
  shadeTop: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    height: FRAME_H / 2 - CELL_H / 2,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  shadeBottom: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: FRAME_H / 2 - CELL_H / 2,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  drumGlow: {
    position: "absolute",
    width: 170,
    height: FRAME_H + 16,
    borderRadius: 28,
    backgroundColor: "transparent",
    borderWidth: 2,
    borderColor: "#f59e0b",
    shadowColor: "#f59e0b",
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 0 },
  },
});
