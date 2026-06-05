import { useEffect, useRef, useState } from "react";
import { Animated, Modal, Pressable, View } from "react-native";
import { Sparkles, X, Star } from "lucide-react-native";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/Button";

const REEL = ["🍒", "🍋", "🔔", "⭐", "7️⃣", "🍇", "💎"];

type Phase = "idle" | "spinning" | "win" | "lose";

interface SpinModalProps {
  visible: boolean;
  balance: number;
  spinCost: number;
  /** Server result injected by parent after the spin API call. */
  result: { win: boolean; token?: string; balance?: number } | null;
  spinning: boolean;
  onSpin: () => void;
  onClose: () => void;
  onClaim: (token: string) => void;
}

export function SpinModal({ visible, balance, spinCost, result, spinning, onSpin, onClose, onClaim }: SpinModalProps) {
  const [reel, setReel] = useState([REEL[0], REEL[1], REEL[2]]);
  const [phase, setPhase] = useState<Phase>("idle");
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Spin reel animation while request in-flight
  useEffect(() => {
    if (!spinning) return;
    setPhase("spinning");
    const iv = setInterval(() => {
      setReel([
        REEL[Math.floor(Math.random() * REEL.length)],
        REEL[Math.floor(Math.random() * REEL.length)],
        REEL[Math.floor(Math.random() * REEL.length)],
      ]);
    }, 90);
    return () => clearInterval(iv);
  }, [spinning]);

  // Settle when result arrives
  useEffect(() => {
    if (!result) return;
    if (result.win) {
      setReel(["7️⃣", "7️⃣", "7️⃣"]);
      setPhase("win");
      // Pulse animation on win
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.1, duration: 400, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
        ])
      ).start();
    } else {
      setPhase("lose");
    }
  }, [result]);

  // Reset when closed
  useEffect(() => {
    if (!visible) {
      setPhase("idle");
      setReel([REEL[0], REEL[1], REEL[2]]);
      pulseAnim.setValue(1);
    }
  }, [visible]);

  const currentBalance = result?.balance ?? balance;
  const canSpin = currentBalance >= spinCost && phase === "idle";

  const title =
    phase === "win" ? "🎉 You won!" :
    phase === "lose" ? "Not this time" :
    phase === "spinning" ? "Spinning…" :
    "Free Spin";

  const subtitle =
    phase === "win" ? "Your checkout is FREE — claim it below!" :
    phase === "lose" ? "Better luck next spin. Keep collecting credits!" :
    phase === "spinning" ? "Good luck…" :
    `Spend ${spinCost} credits for a chance at a free checkout`;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-background">
        {/* Header */}
        <View className="flex-row items-center justify-between px-5 pt-5 pb-4">
          <View className="flex-row items-center gap-2">
            <View className="w-9 h-9 rounded-xl items-center justify-center bg-primary">
              <Sparkles size={18} color="#000" strokeWidth={2} />
            </View>
            <Text className="text-foreground font-bold text-lg tracking-tight">{title}</Text>
          </View>
          <Pressable onPress={onClose} className="active:opacity-60 p-1">
            <X size={22} color="#8f8f8f" strokeWidth={2} />
          </Pressable>
        </View>

        <Text className="text-muted-foreground text-sm text-center px-6 mb-6">{subtitle}</Text>

        {/* Reel */}
        <Animated.View
          className="flex-row justify-center gap-3 mb-6"
          style={{ transform: [{ scale: phase === "win" ? pulseAnim : 1 }] }}
        >
          {reel.map((sym, i) => (
            <View
              key={i}
              className="items-center justify-center rounded-2xl border border-border bg-muted"
              style={{ width: 80, height: 96 }}
            >
              <Text style={{ fontSize: 40 }}>{sym}</Text>
            </View>
          ))}
        </Animated.View>

        {/* Balance pill */}
        <View className="flex-row items-center justify-center gap-1.5 mb-8">
          <Star size={14} color="#fbbf24" strokeWidth={2} fill="#fbbf24" />
          <Text className="text-muted-foreground text-sm">
            <Text className="text-foreground font-semibold">{currentBalance}</Text> credits remaining
          </Text>
        </View>

        {/* Actions */}
        <View className="px-5 gap-3">
          {phase === "idle" && (
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

          {phase === "win" && result?.token && (
            <Button
              style={{ backgroundColor: "#f59e0b" }}
              onPress={() => onClaim(result.token!)}
              icon={<Sparkles size={16} color="#000" strokeWidth={2} />}
            >
              <Text className="font-semibold text-black">🎟 Claim free tickets!</Text>
            </Button>
          )}

          {phase === "lose" && (
            <>
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
            </>
          )}

          <Button variant="ghost" onPress={onClose}>
            <Text className="text-muted-foreground">
              {phase === "win" ? "Skip — pay normally" : "Close"}
            </Text>
          </Button>
        </View>
      </View>
    </Modal>
  );
}
