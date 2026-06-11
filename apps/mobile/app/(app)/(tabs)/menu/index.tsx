import { useEffect, useState, useMemo } from "react";
import { ActivityIndicator, FlatList, Modal, Pressable, RefreshControl, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  withSequence,
} from "react-native-reanimated";
import { ShoppingBag, AlertTriangle, Star, Plus, Minus } from "lucide-react-native";
import { supabase } from "@/lib/supabase";
import type { Drink, DrinkCategoryRow } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Card, CardTitle, CardDescription } from "@/components/ui/Card";
import { Input } from "@/components/ui/input";
import { PressableScale } from "@/components/ui/PressableScale";
import { Text } from "@/components/ui/text";
import { Separator } from "@/components/ui/separator";

interface CartItem { drink: Drink; quantity: number }

export default function MenuScreen() {
  const insets = useSafeAreaInsets();
  const [drinks, setDrinks]         = useState<Drink[]>([]);
  const [categories, setCategories] = useState<DrinkCategoryRow[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeCat, setActiveCat]   = useState<string>("ALL");
  const [cart, setCart]             = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen]     = useState(false);
  const [guestName, setGuestName]   = useState("");
  const [notes, setNotes]           = useState("");
  const [placing, setPlacing]       = useState(false);

  async function load() {
    const [{ data: d }, { data: c }] = await Promise.all([
      (supabase as any).from("drinks").select("*").eq("available", true).order("sort_order").order("name"),
      (supabase as any).from("drink_categories").select("*").order("sort_order").order("name"),
    ]);
    setDrinks(d ?? []);
    setCategories(c ?? []);
  }

  useEffect(() => { load().finally(() => setLoading(false)); }, []);
  async function onRefresh() { setRefreshing(true); await load(); setRefreshing(false); }

  const categoryTabs = useMemo(() =>
    categories.filter(c => drinks.some(d => d.category_id === c.id)),
    [drinks, categories]
  );

  const filtered = useMemo(() =>
    activeCat === "ALL" ? drinks : drinks.filter(d => d.category_id === activeCat),
    [drinks, activeCat]
  );

  function addToCart(drink: Drink) {
    setCart(prev => {
      const idx = prev.findIndex(c => c.drink.id === drink.id);
      if (idx >= 0) return prev.map((c, i) => i === idx ? { ...c, quantity: c.quantity + 1 } : c);
      return [...prev, { drink, quantity: 1 }];
    });
  }

  function adjustQty(drinkId: string, delta: number) {
    setCart(prev => prev.flatMap(c => {
      if (c.drink.id !== drinkId) return [c];
      const next = c.quantity + delta;
      return next <= 0 ? [] : [{ ...c, quantity: next }];
    }));
  }

  const getQty    = (id: string) => cart.find(c => c.drink.id === id)?.quantity ?? 0;
  const cartCount = cart.reduce((s, i) => s + i.quantity, 0);
  const cartTotal = cart.reduce((s, i) => {
    const p = i.drink.sale_enabled && i.drink.sale_price ? i.drink.sale_price : i.drink.price;
    return s + p * i.quantity;
  }, 0);

  async function placeOrder() {
    if (cart.length === 0) return;
    setPlacing(true);
    try {
      const { data, error } = await supabase.rpc("place_bar_order", {
        p_guest_name: guestName.trim() || null,
        p_notes:      notes.trim() || null,
        p_items:      cart.map(c => ({ drinkId: c.drink.id, quantity: c.quantity, notes: null })),
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      setCart([]); setCartOpen(false); setGuestName(""); setNotes("");
      router.push(`/(app)/menu/order?orderId=${data.id}&qrToken=${data.qrToken}` as never);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setPlacing(false);
    }
  }

  if (loading) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator size="large" color="#EBE05A" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      {/* Header */}
      <View className="px-5 pt-4 pb-2">
        <Text className="text-foreground text-2xl font-bold tracking-tight">Bar Menu</Text>
        <Text className="text-muted-foreground text-sm">{drinks.length} items available</Text>
      </View>

      {/* Category tabs — plain, uniform (no per-category colour or emoji) */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginBottom: 8 }}
        contentContainerStyle={{ gap: 8, paddingHorizontal: 20, paddingVertical: 4 }}
      >
        {[{ id: "ALL", name: "All" }, ...categoryTabs].map((c) => {
          const active = activeCat === c.id;
          return (
            <Pressable
              key={c.id}
              onPress={() => setActiveCat(c.id)}
              style={active ? { backgroundColor: "#EBE05A" } : undefined}
              className={`px-3 py-1.5 rounded-full ${active ? "" : "bg-card border border-border"}`}
            >
              <Text
                style={active ? { color: "#323000", fontWeight: "600", fontSize: 13 } : { fontSize: 13 }}
                className={active ? "" : "text-muted-foreground"}
              >
                {c.name}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Drink list */}
      <FlatList
        data={filtered}
        keyExtractor={d => d.id}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: cartCount > 0 ? 120 : 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fafafa" />}
        renderItem={({ item: drink }) => {
          const price = drink.sale_enabled && drink.sale_price ? drink.sale_price : drink.price;
          const qty   = getQty(drink.id);
          return (
            <Card className="mb-3">
              <View className="flex-row items-start justify-between mb-3">
                <View className="flex-1 mr-3">
                  <CardTitle>{drink.name}</CardTitle>
                  {drink.description && <CardDescription numberOfLines={2}>{drink.description}</CardDescription>}
                  {drink.allergens?.length > 0 && (
                    <View className="flex-row items-center gap-1 mt-1">
                      <AlertTriangle size={12} color="#8f8f8f" strokeWidth={1.75} />
                      <Text className="text-muted-foreground text-xs">{drink.allergens.join(", ")}</Text>
                    </View>
                  )}
                  {drink.is_popular && (
                    <View className="flex-row items-center gap-1 mt-0.5">
                      <Star size={12} color="#fafafa" strokeWidth={1.75} fill="#fafafa" />
                      <Text className="text-xs text-foreground">Popular</Text>
                    </View>
                  )}
                </View>
                <View className="items-end">
                  <Text className="text-foreground font-bold text-base">{formatCurrency(price)}</Text>
                  {drink.sale_enabled && drink.sale_price && (
                    <Text className="text-muted-foreground text-xs line-through">{formatCurrency(drink.price)}</Text>
                  )}
                </View>
              </View>
              <View className="flex-row justify-end">
                {qty === 0 ? (
                  <PressableScale
                    onPress={() => addToCart(drink)}
                    className="flex-row items-center gap-1.5 bg-gold rounded-xl px-4 py-2.5"
                  >
                    <Plus size={15} color="#323000" strokeWidth={2.25} />
                    <Text className="text-gold-foreground font-semibold text-sm">Add</Text>
                  </PressableScale>
                ) : (
                  <View className="flex-row items-center gap-4 bg-secondary border border-border rounded-xl px-4 py-2">
                    <PressableScale pressedScale={0.85} onPress={() => adjustQty(drink.id, -1)} hitSlop={8}>
                      <Minus size={18} color="#fafafa" strokeWidth={2} />
                    </PressableScale>
                    <Text className="text-foreground font-bold w-6 text-center">{qty}</Text>
                    <PressableScale pressedScale={0.85} onPress={() => adjustQty(drink.id, 1)} hitSlop={8}>
                      <Plus size={18} color="#fafafa" strokeWidth={2} />
                    </PressableScale>
                  </View>
                )}
              </View>
            </Card>
          );
        }}
      />

      {/* Sticky animated cart bar */}
      <CartBar
        count={cartCount}
        total={formatCurrency(cartTotal)}
        bottomInset={insets.bottom}
        onPress={() => setCartOpen(true)}
      />

      {/* Cart modal */}
      <Modal visible={cartOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setCartOpen(false)}>
        <View className="flex-1 bg-background px-5 pt-6">
          <View className="flex-row items-center justify-between mb-6">
            <Text className="text-foreground text-xl font-bold tracking-tight">Your Order</Text>
            <Button variant="ghost" size="sm" onPress={() => setCartOpen(false)}>
              <Text className="text-muted-foreground">Close</Text>
            </Button>
          </View>

          <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
            {cart.map(item => {
              const p = item.drink.sale_enabled && item.drink.sale_price ? item.drink.sale_price : item.drink.price;
              return (
                <View key={item.drink.id} className="flex-row items-center border-b border-border py-3">
                  <View className="flex-1">
                    <Text className="text-foreground font-medium">{item.drink.name}</Text>
                    <Text className="text-muted-foreground text-sm">{formatCurrency(p)} × {item.quantity}</Text>
                  </View>
                  <View className="flex-row items-center gap-2">
                    <PressableScale pressedScale={0.85} onPress={() => adjustQty(item.drink.id, -1)} className="w-8 h-8 bg-secondary border border-border rounded-lg items-center justify-center">
                      <Minus size={15} color="#fafafa" strokeWidth={2} />
                    </PressableScale>
                    <Text className="text-foreground font-bold w-5 text-center">{item.quantity}</Text>
                    <PressableScale pressedScale={0.85} onPress={() => adjustQty(item.drink.id, 1)} className="w-8 h-8 bg-secondary border border-border rounded-lg items-center justify-center">
                      <Plus size={15} color="#fafafa" strokeWidth={2} />
                    </PressableScale>
                    <Text className="text-foreground font-semibold w-16 text-right">{formatCurrency(p * item.quantity)}</Text>
                  </View>
                </View>
              );
            })}

            <View className="mt-5 gap-3">
              <Input placeholder="Your name (optional)" value={guestName} onChangeText={setGuestName} />
              <Input placeholder="Notes, e.g. no ice" value={notes} onChangeText={setNotes} multiline numberOfLines={2} />
            </View>
          </ScrollView>

          <View className="py-4">
            <Separator className="mb-4" />
            {/* Checkout CTA — same as web: label left, count · total right */}
            <Button className="w-full" onPress={placeOrder} loading={placing} disabled={placing}>
              <View className="w-full flex-row items-center justify-between">
                <Text>Place Order</Text>
                <Text className="font-bold">{cartCount} · {formatCurrency(cartTotal)}</Text>
              </View>
            </Button>
          </View>
        </View>
      </Modal>
    </View>
  );
}

/** Sticky bottom cart bar — springs up from below when the cart is non-empty,
 *  and pops the count badge on every quantity change. */
function CartBar({
  count, total, bottomInset, onPress,
}: { count: number; total: string; bottomInset: number; onPress: () => void }) {
  const visible = count > 0;
  const ty    = useSharedValue(120);
  const badge = useSharedValue(1);

  useEffect(() => {
    ty.value = withSpring(visible ? 0 : 120, { stiffness: 260, damping: 24 });
  }, [visible, ty]);

  useEffect(() => {
    if (count > 0) badge.value = withSequence(
      withTiming(1.3, { duration: 110 }),
      withSpring(1, { stiffness: 380, damping: 14 }),
    );
  }, [count, badge]);

  const barStyle   = useAnimatedStyle(() => ({ transform: [{ translateY: ty.value }] }));
  const badgeStyle = useAnimatedStyle(() => ({ transform: [{ scale: badge.value }] }));

  // Keep mounted only while relevant to avoid intercepting touches when hidden
  if (!visible && ty.value >= 120) return null;

  return (
    <Animated.View
      pointerEvents={visible ? "auto" : "none"}
      style={[
        { position: "absolute", left: 16, right: 16, bottom: bottomInset + 12 },
        barStyle,
      ]}
    >
      <PressableScale
        pressedScale={0.97}
        onPress={onPress}
        style={{
          flexDirection: "row",
          alignItems: "center",
          backgroundColor: "#EBE05A",
          borderRadius: 18,
          paddingVertical: 14,
          paddingHorizontal: 18,
          shadowColor: "#000",
          shadowOpacity: 0.35,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 8 },
        }}
      >
        <Animated.View
          style={[
            {
              width: 30, height: 30, borderRadius: 9,
              backgroundColor: "#0A0A0A",
              alignItems: "center", justifyContent: "center",
            },
            badgeStyle,
          ]}
        >
          <Text className="text-background font-bold text-sm">{count}</Text>
        </Animated.View>
        <View className="flex-row items-center gap-2 ml-3 flex-1">
          <ShoppingBag size={16} color="#0A0A0A" strokeWidth={2} />
          <Text style={{ color: "#0A0A0A", fontWeight: "700", fontSize: 15 }}>View order</Text>
        </View>
        <Text style={{ color: "#0A0A0A", fontWeight: "800", fontSize: 16 }}>{total}</Text>
      </PressableScale>
    </Animated.View>
  );
}
