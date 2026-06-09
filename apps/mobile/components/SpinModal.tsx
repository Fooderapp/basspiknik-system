import { useEffect, useRef, useState } from "react";
import { Modal, Pressable, StyleSheet, Vibration, View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  runOnJS,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { Accelerometer } from "expo-sensors";
import { Dices, X, Star, Info, Smartphone } from "lucide-react-native";
import { Text } from "@/components/ui/text";
import { Dice3D } from "@/components/Dice3D";

// ── Dice config ──────────────────────────────────────────────────────────────
const WIN_FACE = 6;                               // double six = jackpot

type Phase = "idle" | "rolling" | "win" | "lose";

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

const d6 = () => 1 + Math.floor(Math.random() * 6);

// A pair that is NOT double-six, for losing rolls.
function loseFaces(): [number, number] {
  let a = d6(), b = d6();
  while (a === WIN_FACE && b === WIN_FACE) b = d6();
  return [a, b];
}

export function SpinModal({ visible, balance, spinCost, result, spinning, onSpin, onClose, onClaim }: SpinModalProps) {
  const [faces, setFaces] = useState<[number, number]>([WIN_FACE, WIN_FACE]);
  const [rolling, setRolling] = useState(false);
  const [phaseState, setPhaseState] = useState<Phase>("idle");

  const glow  = useSharedValue(0);   // win frame glow
  const shake = useSharedValue(0);   // lose nudge

  const currentBalance = result?.balance ?? balance;
  const canSpin = currentBalance >= spinCost && phaseState === "idle";
  // Shake triggers a roll whether idle (first roll) or after a loss (re-roll)
  const canShake = currentBalance >= spinCost && (phaseState === "idle" || phaseState === "lose");

  const canSpinRef = useRef(canSpin);
  canSpinRef.current = canSpin;
  const canShakeRef = useRef(canShake);
  canShakeRef.current = canShake;
  const onSpinRef = useRef(onSpin);
  onSpinRef.current = onSpin;

  // ── Shake to roll ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!visible) return;
    let last = 0;
    Accelerometer.setUpdateInterval(80);
    const sub = Accelerometer.addListener(({ x, y, z }) => {
      const g = Math.sqrt(x * x + y * y + z * z);   // ~1 at rest, spikes on shake
      const now = Date.now();
      if (g > 1.75 && now - last > 1100 && canShakeRef.current) {
        last = now;
        Vibration.vibrate(20);
        onSpinRef.current();
      }
    });
    return () => sub.remove();
  }, [visible]);

  // ── Start tumbling when a spin kicks off ─────────────────────────────────────
  useEffect(() => {
    if (!spinning) return;
    setPhaseState("rolling");
    setRolling(true);
    glow.value = 0;
  }, [spinning]);

  // Cycle faces rapidly while the dice tumble
  useEffect(() => {
    if (!rolling) return;
    const id = setInterval(() => setFaces([d6(), d6()]), 90);
    return () => clearInterval(id);
  }, [rolling]);

  // ── Settle to the server-decided outcome ─────────────────────────────────────
  useEffect(() => {
    if (!result) return;
    const finalFaces: [number, number] = result.win ? [WIN_FACE, WIN_FACE] : loseFaces();
    // Guarantee a satisfying tumble before landing
    const t = setTimeout(() => {
      setFaces(finalFaces);
      setRolling(false);
      finishPhase(result.win);
    }, 850);
    return () => clearTimeout(t);
  }, [result]);

  function finishPhase(win: boolean) {
    setPhaseState(win ? "win" : "lose");
    if (win) {
      Vibration.vibrate([0, 40, 60, 40, 60, 80]);
      glow.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 520, easing: Easing.inOut(Easing.ease) }),
          withTiming(0.45, { duration: 520, easing: Easing.inOut(Easing.ease) }),
        ), -1, true,
      );
    } else {
      Vibration.vibrate(30);
      shake.value = withSequence(
        withTiming(-8, { duration: 55 }),
        withRepeat(withSequence(
          withTiming(8, { duration: 90 }),
          withTiming(-8, { duration: 90 }),
        ), 2, true),
        withTiming(0, { duration: 55 }),
      );
    }
  }

  // Reset on close
  useEffect(() => {
    if (!visible) {
      cancelAnimation(glow); cancelAnimation(shake);
      glow.value = 0; shake.value = 0;
      setRolling(false);
      setPhaseState("idle");
    }
  }, [visible]);

  const isWin = phaseState === "win";

  const frameStyle = useAnimatedStyle(() => ({
    borderColor: `rgba(245,158,11,${interpolate(glow.value, [0, 1], [0.18, 1])})`,
    shadowOpacity: interpolate(glow.value, [0, 1], [0, 0.9]),
    transform: [{ translateX: shake.value }],
  }));

  // Phase message pop
  const pop = useSharedValue(0.6);
  useEffect(() => {
    if (phaseState === "idle" || phaseState === "rolling") return;
    pop.value = 0.6;
    pop.value = withSpring(1, { stiffness: 320, damping: 12 });
  }, [phaseState]);
  const popStyle = useAnimatedStyle(() => ({
    opacity: interpolate(pop.value, [0.6, 1], [0, 1]),
    transform: [{ scale: pop.value }],
  }));

  // Roll CTA breathing pulse
  const pulse = useSharedValue(1);
  useEffect(() => {
    if (canSpin) {
      pulse.value = withRepeat(withSequence(
        withTiming(1.04, { duration: 850, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 850, easing: Easing.inOut(Easing.ease) }),
      ), -1, true);
    } else {
      cancelAnimation(pulse);
      pulse.value = withTiming(1, { duration: 150 });
    }
  }, [canSpin]);
  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View className="flex-1 bg-background">
        {/* Header */}
        <View className="flex-row items-center justify-between px-5 pt-5 pb-3">
          <View className="flex-row items-center gap-2">
            <View className="w-9 h-9 rounded-xl items-center justify-center" style={{ backgroundColor: "#f59e0b" }}>
              <Dices size={18} color="#000" strokeWidth={2.25} />
            </View>
            <Text className="text-foreground font-bold text-xl tracking-tight">Lucky Roll</Text>
          </View>
          <Pressable onPress={onClose} className="active:opacity-60 p-1">
            <X size={22} color="#8f8f8f" strokeWidth={2} />
          </Pressable>
        </View>

        <View className="flex-1 items-center justify-center px-5">
          {/* Marquee */}
          <View className="flex-row items-center gap-2 mb-6">
            <Star size={14} color="#fbbf24" strokeWidth={2} fill="#fbbf24" />
            <Text className="text-amber-400 font-bold tracking-[3px] text-xs">DOUBLE SIX = FREE CHECKOUT</Text>
            <Star size={14} color="#fbbf24" strokeWidth={2} fill="#fbbf24" />
          </View>

          {/* Dice tray — real-time 3D dice (three.js / expo-gl) */}
          <Animated.View style={[styles.tray, frameStyle]}>
            <Dice3D rolling={rolling} faces={faces} win={isWin} width={252} height={150} />
            <WinBurst active={isWin} />
          </Animated.View>

          {/* Phase message */}
          <View style={{ height: 30, justifyContent: "center" }}>
            {(phaseState === "win" || phaseState === "lose") && (
              <Animated.View style={popStyle}>
                <Text className={`text-center font-bold text-base ${isWin ? "text-amber-400" : "text-muted-foreground"}`}>
                  {isWin ? "🎉 DOUBLE SIX! Free checkout unlocked" : "Not this time — roll again!"}
                </Text>
              </Animated.View>
            )}
            {phaseState === "rolling" && (
              <Text className="text-center text-muted-foreground text-sm">Rolling…</Text>
            )}
            {phaseState === "idle" && canSpin && (
              <View className="flex-row items-center gap-1.5">
                <Smartphone size={13} color="#8f8f8f" strokeWidth={1.75} />
                <Text className="text-center text-muted-foreground text-sm">Shake your phone or tap to roll</Text>
              </View>
            )}
          </View>

          {/* Balance */}
          <View className="flex-row items-center gap-1.5 mt-3">
            <Star size={13} color="#fbbf24" strokeWidth={2} fill="#fbbf24" />
            <Text className="text-muted-foreground text-sm">
              <Text className="text-foreground font-bold">{currentBalance}</Text> credits · {spinCost} per roll
            </Text>
          </View>
        </View>

        {/* Actions */}
        <View className="px-5 pb-2 gap-3" style={{ paddingBottom: 28 }}>
          {(phaseState === "idle" || phaseState === "rolling") && (
            <Animated.View style={pulseStyle}>
              <Pressable
                onPress={onSpin}
                disabled={!canSpin}
                className="rounded-2xl items-center justify-center active:opacity-90"
                style={{ height: 60, backgroundColor: canSpin ? "#f59e0b" : "#27272a" }}
              >
                <View className="flex-row items-center gap-2">
                  <Dices size={18} color={canSpin ? "#000" : "#8f8f8f"} strokeWidth={2.25} />
                  <Text className={`font-bold text-base ${canSpin ? "text-black" : "text-muted-foreground"}`}>
                    {phaseState === "rolling" ? "Rolling…" : canSpin ? `ROLL · ${spinCost} credits` : `Need ${spinCost} credits`}
                  </Text>
                </View>
              </Pressable>
            </Animated.View>
          )}

          {isWin && result?.token && (
            <Pressable
              onPress={() => onClaim(result.token!)}
              className="rounded-2xl items-center justify-center active:opacity-90"
              style={{ height: 60, backgroundColor: "#f59e0b" }}
            >
              <Text className="font-bold text-base text-black">🎟  Claim free tickets</Text>
            </Pressable>
          )}

          {phaseState === "lose" && (
            <Pressable
              onPress={onSpin}
              disabled={currentBalance < spinCost}
              className="rounded-2xl items-center justify-center bg-secondary active:opacity-80"
              style={{ height: 56, opacity: currentBalance < spinCost ? 0.5 : 1 }}
            >
              <Text className="font-semibold text-foreground">
                {currentBalance >= spinCost ? `Roll again · ${spinCost} credits` : "Not enough credits"}
              </Text>
            </Pressable>
          )}

          <Pressable onPress={onClose} className="items-center py-2 active:opacity-60">
            <Text className="text-muted-foreground">{isWin ? "Skip — pay normally" : "Close"}</Text>
          </Pressable>

          <View className="flex-row items-start gap-2 px-1">
            <Info size={13} color="#52525b" strokeWidth={1.75} style={{ marginTop: 2 }} />
            <Text className="text-muted-foreground/70 text-xs flex-1">
              Shake your phone (or tap Roll) to throw the dice. Land double six to win a completely free checkout — no payment needed.
            </Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── Win celebration burst ────────────────────────────────────────────────────
const BURST = Array.from({ length: 16 }, (_, i) => {
  const a = (i / 16) * Math.PI * 2;
  const reach = 120 + (i % 3) * 26;
  return { dx: Math.cos(a) * reach, dy: Math.sin(a) * reach, emoji: i % 3 === 0 ? "⭐" : i % 3 === 1 ? "✨" : "🎉" };
});

function Particle({ b, p }: { b: (typeof BURST)[number]; p: SharedValue<number> }) {
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(p.value, [0, 0.12, 0.75, 1], [0, 1, 1, 0]),
    transform: [
      { translateX: b.dx * p.value },
      { translateY: b.dy * p.value },
      { scale: interpolate(p.value, [0, 0.3, 1], [0.2, 1.2, 0.5]) },
      { rotate: `${p.value * 120}deg` },
    ],
  }));
  return (
    <Animated.View style={[{ position: "absolute" }, style]} pointerEvents="none">
      <Text style={{ fontSize: 22 }}>{b.emoji}</Text>
    </Animated.View>
  );
}

function WinBurst({ active }: { active: boolean }) {
  const p = useSharedValue(0);
  useEffect(() => {
    if (active) { p.value = 0; p.value = withDelay(100, withTiming(1, { duration: 950, easing: Easing.out(Easing.cubic) })); }
    else { cancelAnimation(p); p.value = 0; }
  }, [active]);
  if (!active) return null;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center" }]}>
      {BURST.map((b, i) => <Particle key={i} b={b} p={p} />)}
    </View>
  );
}

const styles = StyleSheet.create({
  tray: {
    padding: 26,
    borderRadius: 28,
    borderWidth: 2,
    backgroundColor: "#0c0c0f",
    shadowColor: "#f59e0b",
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 0 },
  },
});
