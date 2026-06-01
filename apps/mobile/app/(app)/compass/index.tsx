import { useState, useEffect, useRef, useCallback } from "react";
import {
  View, FlatList, ActivityIndicator, Animated,
  Modal, Alert, Pressable,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Location from "expo-location";
import { Magnetometer } from "expo-sensors";
import { CameraView } from "expo-camera";
import {
  Compass, UserPlus, MapPin, Calendar,
  X, Check, Radio, Clock,
} from "lucide-react-native";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/auth";
import { formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Card, CardTitle, CardDescription } from "@/components/ui/Card";
import { Text } from "@/components/ui/text";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type { Event } from "@/lib/types";

// ── Haversine distance (metres) ────────────────────────────────────────────────
function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Bearing from me to friend (degrees, 0=N) ───────────────────────────────────
function bearing(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos((lat2 * Math.PI) / 180);
  const x =
    Math.cos((lat1 * Math.PI) / 180) * Math.sin((lat2 * Math.PI) / 180) -
    Math.sin((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function formatDistance(m: number): string {
  if (m < 50)  return "~" + Math.round(m / 10) * 10 + "m";
  if (m < 500) return "~" + Math.round(m / 50) * 50 + "m";
  return "~" + (m / 1000).toFixed(1) + "km";
}

function formatLastSeen(iso: string): { label: string; stale: boolean; ghost: boolean } {
  const diffS = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diffS < 60)  return { label: "now",                      stale: false, ghost: false };
  if (diffS < 300) return { label: Math.round(diffS / 60) + " min ago", stale: false, ghost: false };
  if (diffS < 900) return { label: Math.round(diffS / 60) + " min ago", stale: true,  ghost: false };
  return             { label: Math.round(diffS / 60) + " min ago", stale: true,  ghost: true  };
}

interface Friend {
  id: string;
  name: string;
  fuzzy_lat: number;
  fuzzy_lng: number;
  updated_at: string;
}

export default function CompassScreen() {
  const { profile } = useAuth();
  const insets = useSafeAreaInsets();

  // ── Event selection ──────────────────────────────────────────────────────────
  const [events, setEvents]               = useState<Event[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [loadingEvents, setLoadingEvents] = useState(true);

  // ── Location + compass ───────────────────────────────────────────────────────
  const [sharing, setSharing]     = useState(false);
  const [myLoc, setMyLoc]         = useState<{ lat: number; lng: number } | null>(null);
  const [heading, setHeading]     = useState(0);   // device compass heading (°)
  const needleAnim                = useRef(new Animated.Value(0)).current;
  const lastHeading               = useRef(0);

  // ── Friends ──────────────────────────────────────────────────────────────────
  const [friends, setFriends]     = useState<Friend[]>([]);
  const [selected, setSelected]   = useState<Friend | null>(null);

  // ── QR scanner ──────────────────────────────────────────────────────────────
  const [scannerOpen, setScannerOpen] = useState(false);
  const [adding, setAdding]           = useState(false);
  const scanCooldown                  = useRef(false);

  // ── Load events ─────────────────────────────────────────────────────────────
  useEffect(() => {
    (supabase as any)
      .from("events")
      .select("*")
      .eq("status", "PUBLISHED")
      .order("start_date")
      .then(({ data }: any) => { setEvents(data ?? []); setLoadingEvents(false); });
  }, []);

  // ── Compass heading (Magnetometer) ───────────────────────────────────────────
  useEffect(() => {
    const sub = Magnetometer.addListener(({ x, y }) => {
      let deg = Math.atan2(y, x) * (180 / Math.PI);
      if (deg < 0) deg += 360;
      deg = (deg + 90) % 360; // adjust for device orientation

      // Smooth transition
      const diff = ((deg - lastHeading.current + 540) % 360) - 180;
      const next = lastHeading.current + diff;
      lastHeading.current = next;
      setHeading(next);
      Animated.spring(needleAnim, { toValue: next, useNativeDriver: true, speed: 14, bounciness: 0 }).start();
    });
    Magnetometer.setUpdateInterval(200);
    return () => sub.remove();
  }, []);

  // ── Location sharing loop ────────────────────────────────────────────────────
  useEffect(() => {
    if (!sharing || !selectedEvent) return;

    async function requestAndStart() {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission denied", "Location access is needed for Friend Compass.");
        setSharing(false);
        return;
      }
      push();
    }

    async function push() {
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude: lat, longitude: lng } = loc.coords;
      setMyLoc({ lat, lng });
      await (supabase as any).rpc("upsert_my_location", {
        p_event_id: selectedEvent!.id,
        p_lat: lat,
        p_lng: lng,
      });
    }

    requestAndStart();
    const interval = setInterval(push, 30000);
    return () => {
      clearInterval(interval);
      // Remove my location when sharing stops
      (supabase as any).from("event_locations").delete().eq("user_id", profile!.id);
    };
  }, [sharing, selectedEvent]);

  // ── Realtime friend locations ────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedEvent || !sharing) return;

    fetchFriends();

    const channel = (supabase as any)
      .channel(`compass:${selectedEvent.id}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "event_locations",
        filter: `event_id=eq.${selectedEvent.id}`,
      }, () => fetchFriends())
      .subscribe();

    return () => { (supabase as any).removeChannel(channel); };
  }, [selectedEvent, sharing]);

  async function fetchFriends() {
    if (!selectedEvent || !profile) return;
    // Fetch all group members' locations for this event (RLS filters to my friends)
    const { data } = await (supabase as any)
      .from("event_locations")
      .select("user_id, fuzzy_lat, fuzzy_lng, updated_at, profiles(name)")
      .eq("event_id", selectedEvent.id)
      .neq("user_id", profile.id);

    setFriends(
      (data ?? []).map((r: any) => ({
        id: r.user_id,
        name: r.profiles?.name ?? "Friend",
        fuzzy_lat: r.fuzzy_lat,
        fuzzy_lng: r.fuzzy_lng,
        updated_at: r.updated_at,
      }))
    );
  }

  // ── Add friend via QR scan ───────────────────────────────────────────────────
  async function handleScan(walletToken: string) {
    if (scanCooldown.current || adding || !selectedEvent) return;
    scanCooldown.current = true;
    setAdding(true);
    try {
      const { data, error } = await (supabase as any).rpc("add_compass_friend", {
        p_wallet_token: walletToken,
        p_event_id: selectedEvent.id,
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      setScannerOpen(false);
      Alert.alert("Friend added!", `${data.name} joined your compass group.`);
      fetchFriends();
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setAdding(false);
      setTimeout(() => { scanCooldown.current = false; }, 2000);
    }
  }

  // ── Needle angle toward selected friend ─────────────────────────────────────
  function needleAngle(friend: Friend): number {
    if (!myLoc) return 0;
    const b = bearing(myLoc.lat, myLoc.lng, friend.fuzzy_lat, friend.fuzzy_lng);
    return b - heading;
  }

  // ─────────────────────────────────────────────────────────────────────────────

  if (loadingEvents) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator size="large" color="#fafafa" />
      </View>
    );
  }

  // ── Event selection ──────────────────────────────────────────────────────────
  if (!selectedEvent) {
    return (
      <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
        <View className="px-5 pt-4 pb-3">
          <Text className="text-foreground text-2xl font-bold tracking-tight">Friend Compass</Text>
          <Text className="text-muted-foreground text-sm">Select an event to start</Text>
        </View>
        <FlatList
          data={events}
          keyExtractor={e => e.id}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}
          ListEmptyComponent={
            <View className="items-center py-20">
              <View className="w-14 h-14 rounded-2xl items-center justify-center mb-4 border border-border bg-muted">
                <Compass size={24} color="#8f8f8f" strokeWidth={1.75} />
              </View>
              <Text className="text-muted-foreground">No published events</Text>
            </View>
          }
          renderItem={({ item }) => (
            <Button variant="outline" className="mb-3 h-auto py-4 px-4 items-start" onPress={() => setSelectedEvent(item)}>
              <View className="w-full">
                <Text className="text-foreground font-bold text-base tracking-tight">{item.name}</Text>
                {item.venue && (
                  <View className="flex-row items-center gap-1.5 mt-1">
                    <MapPin size={13} color="#8f8f8f" strokeWidth={1.75} />
                    <Text className="text-muted-foreground text-sm">{item.venue}</Text>
                  </View>
                )}
                <View className="flex-row items-center gap-1.5 mt-1">
                  <Calendar size={13} color="#8f8f8f" strokeWidth={1.75} />
                  <Text className="text-muted-foreground text-sm">{formatDate(item.start_date)}</Text>
                </View>
              </View>
            </Button>
          )}
        />
      </View>
    );
  }

  // ── Compass screen ───────────────────────────────────────────────────────────
  const friendAngle = selected && myLoc ? needleAngle(selected) : 0;

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>

      {/* Header */}
      <View className="flex-row items-center justify-between px-5 pt-4 pb-3">
        <View className="flex-1 mr-3">
          <Button variant="ghost" size="sm" className="self-start px-0" onPress={() => { setSelectedEvent(null); setSharing(false); setFriends([]); }}>
            <Text className="text-foreground text-sm">← Events</Text>
          </Button>
          <Text className="text-foreground font-bold text-lg tracking-tight" numberOfLines={1}>{selectedEvent.name}</Text>
        </View>
        {/* Share toggle */}
        <Pressable
          onPress={() => setSharing(s => !s)}
          className={`flex-row items-center gap-2 px-4 py-2 rounded-xl border active:opacity-70 ${sharing ? "bg-primary border-primary" : "bg-card border-border"}`}
        >
          <Radio size={14} color={sharing ? "#000000" : "#fafafa"} strokeWidth={2} />
          <Text className={`text-sm font-semibold ${sharing ? "text-primary-foreground" : "text-foreground"}`}>
            {sharing ? "Sharing" : "Share"}
          </Text>
        </Pressable>
      </View>

      {/* Compass dial */}
      <View className="items-center py-6">
        <View className="w-44 h-44 rounded-full border border-border bg-card items-center justify-center">
          {selected && myLoc ? (
            <Animated.View
              style={{
                transform: [{ rotate: needleAnim.interpolate({ inputRange: [-720, 720], outputRange: ["-720deg", "720deg"] }) }],
                alignItems: "center",
              }}
            >
              {/* Static compass rose — needle rotates on top */}
              <View style={{ alignItems: "center" }}>
                <View style={{ width: 4, height: 52, backgroundColor: "#fafafa", borderRadius: 2, marginBottom: 2 }} />
                <View style={{ width: 0, height: 0, borderLeftWidth: 8, borderRightWidth: 8, borderTopWidth: 16, borderLeftColor: "transparent", borderRightColor: "transparent", borderTopColor: "#fafafa" }} />
              </View>
            </Animated.View>
          ) : (
            <Compass size={48} color="#3f3f3f" strokeWidth={1.25} />
          )}
        </View>
        {selected && myLoc ? (
          <View className="items-center mt-3">
            <Text className="text-foreground font-bold text-base">{selected.name}</Text>
            <Text className="text-muted-foreground text-sm">
              {formatDistance(haversine(myLoc.lat, myLoc.lng, selected.fuzzy_lat, selected.fuzzy_lng))}
              {" · "}
              {Math.round(((needleAngle(selected) % 360) + 360) % 360)}°
            </Text>
          </View>
        ) : (
          <Text className="text-muted-foreground text-sm mt-3">
            {sharing ? "Tap a friend to point compass" : "Enable sharing to start"}
          </Text>
        )}
      </View>

      <Separator />

      {/* Friends list */}
      <View className="flex-1 px-5 pt-4">
        <View className="flex-row items-center justify-between mb-3">
          <Text className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
            Group · {friends.length} {friends.length === 1 ? "friend" : "friends"}
          </Text>
          {sharing && (
            <Button size="sm" variant="outline" onPress={() => { scanCooldown.current = false; setScannerOpen(true); }} icon={<UserPlus size={13} color="#fafafa" strokeWidth={1.75} />}>
              <Text className="text-sm">Add friend</Text>
            </Button>
          )}
        </View>

        {!sharing ? (
          <View className="items-center py-12">
            <View className="w-14 h-14 rounded-2xl items-center justify-center mb-4 border border-border bg-muted">
              <Radio size={24} color="#8f8f8f" strokeWidth={1.75} />
            </View>
            <Text className="text-foreground font-semibold mb-1">Start sharing your location</Text>
            <Text className="text-muted-foreground text-sm text-center px-6">
              Tap "Share" above, then scan a friend's QR pass to add them to your compass group.
            </Text>
          </View>
        ) : friends.length === 0 ? (
          <View className="items-center py-12">
            <View className="w-14 h-14 rounded-2xl items-center justify-center mb-4 border border-border bg-muted">
              <UserPlus size={24} color="#8f8f8f" strokeWidth={1.75} />
            </View>
            <Text className="text-foreground font-semibold mb-1">No friends yet</Text>
            <Text className="text-muted-foreground text-sm text-center px-6">
              Tap "Add friend" and scan their Apple Wallet pass or app QR.
            </Text>
          </View>
        ) : (
          <FlatList
            data={friends}
            keyExtractor={f => f.id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 32 }}
            renderItem={({ item: f }) => {
              const seen = formatLastSeen(f.updated_at);
              const dist = myLoc ? haversine(myLoc.lat, myLoc.lng, f.fuzzy_lat, f.fuzzy_lng) : null;
              const isSelected = selected?.id === f.id;

              return (
                <Pressable
                  onPress={() => setSelected(isSelected ? null : f)}
                  className="active:opacity-70"
                >
                  <View className={`flex-row items-center gap-3 py-3 px-4 rounded-xl mb-2 border ${isSelected ? "bg-card border-foreground" : "bg-card border-border"} ${seen.ghost ? "opacity-40" : ""}`}>
                    {/* Status dot */}
                    <View className={`w-2.5 h-2.5 rounded-full ${seen.ghost ? "bg-muted-foreground" : seen.stale ? "bg-yellow-500" : "bg-green-500"}`} />

                    <View className="flex-1">
                      <Text className="text-foreground font-semibold">{f.name}</Text>
                      <View className="flex-row items-center gap-1.5 mt-0.5">
                        <Clock size={11} color="#8f8f8f" strokeWidth={1.75} />
                        <Text className="text-muted-foreground text-xs">{seen.label}</Text>
                        {seen.ghost && <Text className="text-muted-foreground text-xs">· phone may be away</Text>}
                      </View>
                    </View>

                    {dist !== null && !seen.ghost && (
                      <View className="items-end">
                        <Text className="text-foreground font-semibold text-sm">{formatDistance(dist)}</Text>
                        {isSelected && (
                          <Text className="text-muted-foreground text-xs">↑ compass active</Text>
                        )}
                      </View>
                    )}
                  </View>
                </Pressable>
              );
            }}
          />
        )}
      </View>

      {/* QR scanner inline modal */}
      <Modal visible={scannerOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setScannerOpen(false)}>
        <View className="flex-1 bg-background px-5 pt-6">
          <View className="flex-row justify-between items-center mb-6">
            <Text className="text-foreground text-xl font-bold tracking-tight">Scan Friend's QR</Text>
            <Pressable onPress={() => setScannerOpen(false)} className="active:opacity-70 p-1">
              <X size={20} color="#8f8f8f" strokeWidth={1.75} />
            </Pressable>
          </View>
          <Text className="text-muted-foreground text-sm mb-4">
            Ask your friend to open their Apple Wallet pass or Profile page and show you their QR code.
          </Text>
          <View style={{ height: 280, borderRadius: 16, overflow: "hidden" }}>
            <CameraView
              style={{ flex: 1 }}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
              onBarcodeScanned={({ data }) => {
                if (scanCooldown.current || !data) return;
                handleScan(data);
              }}
            />
            <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" }} pointerEvents="none">
              <View style={{ width: 180, height: 180, borderRadius: 12, borderWidth: 2, borderColor: "#ffffff" }} />
            </View>
            {adding && (
              <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center", borderRadius: 16 }}>
                <ActivityIndicator size="large" color="#ffffff" />
                <Text className="text-white text-sm mt-3">Adding friend…</Text>
              </View>
            )}
          </View>
          <Text className="text-muted-foreground text-xs text-center mt-4 px-4">
            Both of you will see each other on the compass once added.
          </Text>
        </View>
      </Modal>

    </View>
  );
}
