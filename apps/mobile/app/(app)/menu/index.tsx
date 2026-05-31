import { useEffect, useState, useMemo } from "react";
import { ActivityIndicator, FlatList, Modal, Pressable, RefreshControl, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "@/lib/supabase";
import type { Drink, DrinkCategoryRow } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Card, CardTitle, CardDescription } from "@/components/ui/Card";
import { Input } from "@/components/ui/input";
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
        <ActivityIndicator size="large" color="#7c3aed" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      {/* Header */}
      <View className="flex-row items-center justify-between px-5 pt-4 pb-2">
        <View>
          <Text className="text-foreground text-2xl font-bold">🍹 Bar Menu</Text>
          <Text className="text-muted-foreground text-sm">{drinks.length} items available</Text>
        </View>
        {cartCount > 0 && (
          <Button size="sm" onPress={() => setCartOpen(true)}>
            <Text>🛒 {cartCount} · {formatCurrency(cartTotal)}</Text>
          </Button>
        )}
      </View>

      {/* Category tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="px-5 mb-2"
        contentContainerStyle={{ gap: 8, paddingRight: 20 }}
      >
        <Pressable
          onPress={() => setActiveCat("ALL")}
          className={`px-3 py-1.5 rounded-full ${activeCat === "ALL" ? "bg-primary" : "bg-card border border-border"}`}
        >
          <Text className={activeCat === "ALL" ? "text-primary-foreground font-medium text-sm" : "text-muted-foreground text-sm"}>
            All
          </Text>
        </Pressable>
        {categoryTabs.map(c => (
          <Pressable
            key={c.id}
            onPress={() => setActiveCat(c.id)}
            className={`px-3 py-1.5 rounded-full flex-row items-center gap-1 ${activeCat === c.id ? "bg-primary" : "bg-card border border-border"}`}
          >
            <Text className="text-sm">{c.emoji}</Text>
            <Text className={activeCat === c.id ? "text-primary-foreground font-medium text-sm" : "text-muted-foreground text-sm"}>
              {c.name}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Drink list */}
      <FlatList
        data={filtered}
        keyExtractor={d => d.id}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#7c3aed" />}
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
                    <Text className="text-muted-foreground text-xs mt-1">⚠️ {drink.allergens.join(", ")}</Text>
                  )}
                  {drink.is_popular && <Text className="text-xs mt-0.5" style={{ color: "#f59e0b" }}>⭐ Popular</Text>}
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
                  <Button size="sm" onPress={() => addToCart(drink)}>
                    <Text>+ Add</Text>
                  </Button>
                ) : (
                  <View className="flex-row items-center gap-3 bg-secondary rounded-xl px-4 py-2">
                    <Pressable onPress={() => adjustQty(drink.id, -1)} className="active:opacity-60">
                      <Text className="text-foreground font-bold text-xl">−</Text>
                    </Pressable>
                    <Text className="text-foreground font-bold w-6 text-center">{qty}</Text>
                    <Pressable onPress={() => adjustQty(drink.id, 1)} className="active:opacity-60">
                      <Text className="text-foreground font-bold text-xl">+</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            </Card>
          );
        }}
      />

      {/* Cart modal */}
      <Modal visible={cartOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setCartOpen(false)}>
        <View className="flex-1 bg-background px-5 pt-6">
          <View className="flex-row items-center justify-between mb-6">
            <Text className="text-foreground text-xl font-bold">🛒 Your Order</Text>
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
                    <Pressable onPress={() => adjustQty(item.drink.id, -1)} className="w-8 h-8 bg-secondary rounded-lg items-center justify-center active:opacity-60">
                      <Text className="text-foreground font-bold">−</Text>
                    </Pressable>
                    <Text className="text-foreground font-bold w-5 text-center">{item.quantity}</Text>
                    <Pressable onPress={() => adjustQty(item.drink.id, 1)} className="w-8 h-8 bg-secondary rounded-lg items-center justify-center active:opacity-60">
                      <Text className="text-foreground font-bold">+</Text>
                    </Pressable>
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
            <View className="flex-row justify-between mb-4">
              <Text className="text-foreground font-bold text-lg">Total</Text>
              <Text className="text-foreground font-bold text-lg">{formatCurrency(cartTotal)}</Text>
            </View>
            <Button className="w-full" onPress={placeOrder} loading={placing} disabled={placing}>
              <Text>Place Order</Text>
            </Button>
          </View>
        </View>
      </Modal>
    </View>
  );
}
