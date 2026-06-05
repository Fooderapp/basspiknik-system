import { useEffect, useRef, useState } from "react";
import { Animated, Modal, Pressable, View } from "react-native";
import { Sparkles, X, Star, Info } from "lucide-react-native";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/Button";

// Ordered so 7️⃣ is the jackpot symbol — always last
const REEL = ["🍒", "🍋", "🔔", "🍇", "⭐", "💎", "7️⃣"];
const CELL_H = 80;

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

export function SpinModal({ visible, balance, spinCost, result, spinning, onSpin, onClose, onClaim }: SpinModalProps) {
  // Three rows visible: top (dim), center (active), bottom (dim)
  const [symbols, setSymbols] = useState([REEL[4], REEL[0], REEL[1]]); // [top, center, bottom]
  const [phase, setPhase] = useState<Phase>("idle");

  // Slide animation: translateY cycles -CELL_H → 0 → +CELL_H during spin
  const slideAnim = useRef(new Animated.Value(0)).current;
  const glowAnim  = useRef(new Animated.Value(0)).current;

  // Spin animation: rapid symbol cycling
  useEffect(() => {
    if (!spinning) return;
    setPhase("spinning");
    let idx = 0;
    const iv = setInterval(() => {
      idx = (idx + 1) % REEL.length;
      const prev = REEL[(idx - 1 + REEL.length) % REEL.length];
      const cur  = REEL[idx];
      const next = REEL[(idx + 1) % REEL.length];
      setSymbols([prev, cur, next]);

      // Slide cell up each tick
      slideAnim.setValue(-CELL_H * 0.5);
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, speed: 80 }).start();
    }, 110);
    return () => clearInterval(iv);
  }, [spinning]);

  // Settle result
  useEffect(() => {
    if (!result) return;
    if (result.win) {
      setSymbols(["💎", "7️⃣", "💎"]);
      setPhase("win");
      Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
          Animated.timing(glowAnim, { toValue: 0, duration: 600, useNativeDriver: true }),
        ])
      ).start();
    } else {
      // Land on a non-jackpot symbol
      const loser = REEL[Math.floor(Math.random() * (REEL.length - 1))]; // exclude 7️⃣
      const prev = REEL[(REEL.indexOf(loser) - 1 + REEL.length) % REEL.length];
      const next = REEL[(REEL.indexOf(loser) + 1) % REEL.length];
      setSymbols([prev, loser, next]);
      setPhase("lose");
    }
  }, [result]);

  // Reset on close
  useEffect(() => {
    if (!visible) {
      setPhase("idle");
      setSymbols([REEL[4], REEL[0], REEL[1]]);
      glowAnim.setValue(0);
      slideAnim.setValue(0);
    }
  }, [visible]);

  const currentBalance = result?.balance ?? balance;
  const canSpin = currentBalance >= spinCost && phase === "idle";

  const winOpacity = glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] });

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

        {/* Single vertical slot */}
        <View className="items-center mb-6">
          {/* Slot machine frame */}
          <View
            className="overflow-hidden rounded-2xl border-2 border-border bg-muted"
            style={{ width: 120, height: CELL_H * 3 }}
          >
            <Animated.View style={{ transform: [{ translateY: slideAnim }] }}>
              {symbols.map((sym, i) => {
                const isCenter = i === 1;
                return (
                  <View
                    key={i}
                    style={{ height: CELL_H }}
                    className={`items-center justify-center ${isCenter ? "bg-background border-y border-border" : ""}`}
                  >
                    {isCenter && phase === "win" ? (
                      <Animated.Text style={{ fontSize: 44, opacity: winOpacity }}>{sym}</Animated.Text>
                    ) : (
                      <Text style={{ fontSize: isCenter ? 44 : 30, opacity: isCenter ? 1 : 0.35 }}>{sym}</Text>
                    )}
                  </View>
                );
              })}
            </Animated.View>
          </View>

          {/* Center indicator arrows */}
          <View className="flex-row items-center gap-2 mt-2">
            <Text className="text-primary text-xs font-semibold">▶ spin here ◀</Text>
          </View>
        </View>

        {/* Phase message */}
        {phase !== "idle" && (
          <Text className={`text-center font-semibold text-base mb-4 px-6 ${
            phase === "win" ? "text-amber-400" :
            phase === "lose" ? "text-muted-foreground" :
            "text-foreground"
          }`}>
            {phase === "win"  ? "🎉 Jackpot! Free checkout unlocked!" :
             phase === "lose" ? "Not this time — keep collecting credits!" :
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
              {phase === "win" ? "Skip — pay normally" : "Close"}
            </Text>
          </Button>
        </View>
      </View>
    </Modal>
  );
}
