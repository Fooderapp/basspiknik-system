import { useState } from "react";
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, View } from "react-native";
import { MapPin, Check, X } from "lucide-react-native";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { supabase } from "@/lib/supabase";

export interface BillingData {
  billingName: string;
  billingAddress: string;
  billingCity: string;
  billingPostal: string;
  billingCountry: string;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  /** When set, saves billing data to this profile's DB row. */
  profileId?: string;
  initialData?: Partial<BillingData>;
  /** Called after save/confirm with the collected values. */
  onSave: (data: BillingData) => void;
  title?: string;
  subtitle?: string;
}

export function BillingEditModal({
  visible,
  onClose,
  profileId,
  initialData,
  onSave,
  title = "Billing details",
  subtitle = "Required for your invoice.",
}: Props) {
  const [saving, setSaving] = useState(false);
  const [billingName, setBillingName]   = useState(initialData?.billingName   ?? "");
  const [address,     setAddress]       = useState(initialData?.billingAddress ?? "");
  const [city,        setCity]          = useState(initialData?.billingCity    ?? "");
  const [postal,      setPostal]        = useState(initialData?.billingPostal  ?? "");
  const [country,     setCountry]       = useState(initialData?.billingCountry ?? "Magyarország");

  async function handleSave() {
    if (!billingName.trim() || !address.trim() || !city.trim() || !postal.trim() || !country.trim()) {
      Alert.alert("Missing fields", "Please fill in all billing fields.");
      return;
    }
    const data: BillingData = {
      billingName:    billingName.trim(),
      billingAddress: address.trim(),
      billingCity:    city.trim(),
      billingPostal:  postal.trim(),
      billingCountry: country.trim(),
    };

    if (profileId) {
      setSaving(true);
      try {
        const { error } = await (supabase as any)
          .from("profiles")
          .update({
            billing_name:        data.billingName,
            billing_address:     data.billingAddress,
            billing_city:        data.billingCity,
            billing_postal_code: data.billingPostal,
            billing_country:     data.billingCountry,
            onboarded_at:        new Date().toISOString(),
          })
          .eq("id", profileId);
        if (error) throw error;
      } catch (e: any) {
        Alert.alert("Error", e.message ?? "Could not save billing details.");
        setSaving(false);
        return;
      } finally {
        setSaving(false);
      }
    }

    onSave(data);
    onClose();
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View className="flex-1 bg-background">
        {/* Header */}
        <View className="flex-row items-center justify-between px-5 pt-5 pb-3">
          <View className="flex-row items-center gap-2">
            <View className="w-9 h-9 rounded-xl items-center justify-center bg-primary">
              <MapPin size={16} color="#000" strokeWidth={2} />
            </View>
            <Text className="text-foreground font-bold text-lg tracking-tight">{title}</Text>
          </View>
          <Pressable onPress={onClose} className="active:opacity-60 p-1">
            <X size={22} color="#8f8f8f" strokeWidth={2} />
          </Pressable>
        </View>

        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1">
          <ScrollView className="flex-1 px-5" contentContainerStyle={{ paddingBottom: 24 }}>
            <Text className="text-muted-foreground text-sm mb-5">{subtitle}</Text>
            <View className="gap-4">
              <Input label="Billing name" value={billingName} onChangeText={setBillingName} placeholder="Name on invoice" autoComplete="name" />
              <Input label="Street address" value={address} onChangeText={setAddress} placeholder="Street and number" autoComplete="street-address" />
              <View className="flex-row gap-3">
                <View className="flex-1">
                  <Input label="City" value={city} onChangeText={setCity} placeholder="City" autoComplete="address-level2" />
                </View>
                <View style={{ width: 120 }}>
                  <Input label="Postal code" value={postal} onChangeText={setPostal} placeholder="0000" keyboardType="number-pad" autoComplete="postal-code" />
                </View>
              </View>
              <Input label="Country" value={country} onChangeText={setCountry} placeholder="Country" />
            </View>
          </ScrollView>

          <View className="px-5 pb-8 pt-2 border-t border-border">
            <Button onPress={handleSave} loading={saving} icon={<Check size={18} color="#000" strokeWidth={2} />}>
              <Text className="font-semibold">Save</Text>
            </Button>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
