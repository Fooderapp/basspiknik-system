import { useCallback, useState } from "react";
import { View, ScrollView } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { User, Mail, Hash, Star, ScanLine, Beer, CreditCard, ChevronRight, MapPin, Pencil, type LucideIcon } from "lucide-react-native";
import { useAuth } from "@/context/auth";
import { supabase } from "@/lib/supabase";
import { QRImage } from "@/components/ui/QRImage";
import { TiltCard } from "@/components/ui/TiltCard";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PressableScale } from "@/components/ui/PressableScale";
import { Badge } from "@/components/ui/badge";
import { Text } from "@/components/ui/text";
import { Separator } from "@/components/ui/separator";
import { BillingEditModal } from "@/components/BillingEditModal";

interface StaffTool { icon: LucideIcon; label: string; sub: string; route: string; roles: string[] }
const STAFF_TOOLS: StaffTool[] = [
  { icon: ScanLine,   label: "Check-In",      sub: "Scan ticket QR codes",  route: "/(app)/checkin",   roles: ["ADMIN","EDITOR","STAFF","SELLER","BARTENDER"] },
  { icon: Beer,       label: "Bartender POS", sub: "Process drink orders",  route: "/(app)/bartender", roles: ["ADMIN","EDITOR","BARTENDER"] },
  { icon: CreditCard, label: "Sell Tickets",  sub: "POS ticket selling",    route: "/(app)/seller",    roles: ["ADMIN","EDITOR","SELLER"] },
];

export default function ProfileScreen() {
  const { profile, session, signOut, refreshProfile } = useAuth();
  const insets = useSafeAreaInsets();
  const [credits, setCredits] = useState<number | null>(null);
  const [billingOpen, setBillingOpen] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!session) return;
      (supabase as any)
        .rpc("get_credit_balance", { p_user_id: session.user.id })
        .then(({ data }: any) => setCredits(typeof data === "number" ? data : 0));
    }, [session])
  );

  if (!profile) return null;

  const walletToken = profile.wallet_token ?? null;
  const tools = STAFF_TOOLS.filter(t => t.roles.includes(profile.role));
  const hasBilling = !!(profile.billing_address && profile.billing_city);

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{ paddingTop: insets.top + 16, paddingHorizontal: 20, paddingBottom: insets.bottom + 40 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Title + credit chip */}
      <View className="flex-row items-center justify-between mb-6">
        <View>
          <Text className="text-foreground text-2xl font-bold tracking-tight">My Profile</Text>
          <Text className="text-muted-foreground text-sm mt-1">Account & entry pass</Text>
        </View>
        <PressableScale onPress={() => router.push("/(app)/buy" as never)} pressedScale={0.94}>
          <View className="flex-row items-center gap-1.5 rounded-full px-3.5 py-2" style={{ backgroundColor: "#fff", shadowColor: "#14160F", shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } }}>
            <Star size={13} color="#163300" strokeWidth={2.5} fill="#9FE870" />
            <Text className="font-semibold text-sm" style={{ color: "#14160F" }}>{credits ?? "—"}</Text>
            <Text className="text-xs" style={{ color: "#6B6F63" }}>credits</Text>
          </View>
        </PressableScale>
      </View>

      {/* Entry pass */}
      {walletToken && (
        <View className="mb-6">
          <TiltCard maxTilt={10} radius={28} surface="#FFFFFF" holo="shimmer">
            <View style={{ borderRadius: 28, padding: 22, borderWidth: 1, borderColor: "#E6E4D8" }}>
              <View className="mb-5">
                <Text className="text-muted-foreground text-[11px] font-semibold tracking-[2px]">ENTRY PASS</Text>
              </View>
              <Text className="text-foreground text-2xl font-bold tracking-tight" numberOfLines={1}>{profile.name}</Text>
              <Text className="text-muted-foreground text-xs mb-5" numberOfLines={1}>{profile.email}</Text>
              <View className="items-center">
                <View className="bg-white p-4 rounded-3xl">
                  <QRImage value={walletToken} size={196} />
                </View>
              </View>
              <View className="flex-row items-center justify-between mt-5">
                <View>
                  <Text className="text-muted-foreground text-[10px] tracking-wider">BASS-ID</Text>
                  <Text className="text-foreground font-mono font-semibold">{profile.display_id ?? "—"}</Text>
                </View>
                <Text className="text-muted-foreground text-[10px]">Scan at check-in</Text>
              </View>
            </View>
          </TiltCard>
          <Text className="text-muted-foreground text-xs text-center px-6 mt-3">
            Same code as your Apple Wallet pass. Share your Bass-ID to receive ticket transfers.
          </Text>
        </View>
      )}

      {/* Staff tools */}
      {tools.length > 0 && (
        <View className="mb-6">
          <Text className="text-muted-foreground text-xs font-semibold tracking-wider mb-3">STAFF TOOLS</Text>
          <View className="gap-3">
            {tools.map(tool => {
              const Icon = tool.icon;
              return (
                <PressableScale key={tool.route} onPress={() => router.push(tool.route as never)} pressedScale={0.97}>
                  <Card className="flex-row items-center gap-3 p-4">
                    <View className="w-10 h-10 rounded-xl items-center justify-center border border-border bg-muted">
                      <Icon size={18} color="#14160F" strokeWidth={1.75} />
                    </View>
                    <View className="flex-1">
                      <Text className="text-foreground font-semibold text-base tracking-tight">{tool.label}</Text>
                      <Text className="text-muted-foreground text-xs mt-0.5">{tool.sub}</Text>
                    </View>
                    <ChevronRight size={18} color="#8f8f8f" strokeWidth={1.75} />
                  </Card>
                </PressableScale>
              );
            })}
          </View>
        </View>
      )}

      {/* Account info */}
      <Card className="mb-4 gap-3">
        <Row icon={User}   label="Name"  value={profile.name} />
        <Separator />
        <Row icon={Mail}   label="Email" value={profile.email} />
        {profile.display_id && (
          <>
            <Separator />
            <Row icon={Hash} label="Bass-ID" value={profile.display_id} mono />
          </>
        )}
      </Card>

      {/* Billing address */}
      <Card className="mb-6">
        <View className="flex-row items-center justify-between mb-3">
          <View className="flex-row items-center gap-2">
            <View className="w-9 h-9 rounded-full bg-muted items-center justify-center">
              <MapPin size={16} color="#8f8f8f" strokeWidth={1.75} />
            </View>
            <View>
              <Text className="text-muted-foreground text-xs">Billing address</Text>
              {!hasBilling && (
                <Text className="text-amber-400 text-xs font-medium">Required for invoicing</Text>
              )}
            </View>
          </View>
          <Button
            variant="ghost"
            size="sm"
            onPress={() => setBillingOpen(true)}
            icon={<Pencil size={14} color="#8f8f8f" strokeWidth={1.75} />}
          >
            <Text className="text-muted-foreground text-sm">{hasBilling ? "Edit" : "Add"}</Text>
          </Button>
        </View>

        {hasBilling ? (
          <View className="gap-1 pl-11">
            {profile.billing_name ? <Text className="text-foreground text-sm font-medium">{profile.billing_name}</Text> : null}
            <Text className="text-muted-foreground text-sm">{profile.billing_address}</Text>
            <Text className="text-muted-foreground text-sm">{profile.billing_postal_code} {profile.billing_city}</Text>
            {profile.billing_country ? <Text className="text-muted-foreground text-sm">{profile.billing_country}</Text> : null}
          </View>
        ) : (
          <Text className="text-muted-foreground text-sm pl-11">Not set — needed for Billingo invoices</Text>
        )}
      </Card>

      <Button variant="outline" className="w-full" onPress={signOut}>
        <Text>Sign out</Text>
      </Button>

      <BillingEditModal
        visible={billingOpen}
        onClose={() => setBillingOpen(false)}
        profileId={profile.id}
        initialData={{
          billingName:    profile.billing_name    ?? profile.name ?? "",
          billingAddress: profile.billing_address ?? "",
          billingCity:    profile.billing_city    ?? "",
          billingPostal:  profile.billing_postal_code ?? "",
          billingCountry: profile.billing_country ?? "Magyarország",
        }}
        onSave={async () => { await refreshProfile(); }}
      />
    </ScrollView>
  );
}

function Row({ icon: Icon, label, value, mono }: { icon: LucideIcon; label: string; value: string; mono?: boolean }) {
  return (
    <View className="flex-row items-center gap-3">
      <View className="w-9 h-9 rounded-full bg-muted items-center justify-center">
        <Icon size={16} color="#8f8f8f" strokeWidth={1.75} />
      </View>
      <View className="flex-1">
        <Text className="text-muted-foreground text-xs">{label}</Text>
        <Text className={`text-foreground font-semibold ${mono ? "font-mono" : ""}`}>{value}</Text>
      </View>
    </View>
  );
}
