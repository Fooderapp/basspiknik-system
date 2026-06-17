import { useState } from "react";
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, View } from "react-native";
import { MapPin, Check, X } from "lucide-react-native";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { supabase } from "@/lib/supabase";
import { useLanguage } from "@/context/language";

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
  title,
  subtitle,
}: Props) {
  const { dict } = useLanguage();
  const [saving, setSaving] = useState(false);
  const [billingName, setBillingName]   = useState(initialData?.billingName   ?? "");
  const [address,     setAddress]       = useState(initialData?.billingAddress ?? "");
  const [city,        setCity]          = useState(initialData?.billingCity    ?? "");
  const [postal,      setPostal]        = useState(initialData?.billingPostal  ?? "");
  const [country,     setCountry]       = useState(initialData?.billingCountry ?? "Magyarország");

  const resolvedTitle    = title    ?? dict["billing.title"];
  const resolvedSubtitle = subtitle ?? dict["billing.subtitle"];

  async function handleSave() {
    if (!billingName.trim() || !address.trim() || !city.trim() || !postal.trim() || !country.trim()) {
      Alert.alert(dict["billing.missing"], dict["billing.missing_body"]);
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
        Alert.alert(dict["common.error"], e.message ?? dict["billing.missing_body"]);
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
            <Text className="text-foreground font-bold text-lg tracking-tight">{resolvedTitle}</Text>
          </View>
          <Pressable onPress={onClose} className="active:opacity-60 p-1">
            <X size={22} color="#8f8f8f" strokeWidth={2} />
          </Pressable>
        </View>

        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1">
          <ScrollView className="flex-1 px-5" contentContainerStyle={{ paddingBottom: 24 }}>
            <Text className="text-muted-foreground text-sm mb-5">{resolvedSubtitle}</Text>
            <View className="gap-4">
              <Input label={dict["billing.name"]} value={billingName} onChangeText={setBillingName} placeholder={dict["billing.name_hint"]} autoComplete="name" />
              <Input label={dict["billing.street"]} value={address} onChangeText={setAddress} placeholder={dict["billing.street_hint"]} autoComplete="street-address" />
              <View className="flex-row gap-3">
                <View className="flex-1">
                  <Input label={dict["billing.city"]} value={city} onChangeText={setCity} placeholder={dict["billing.city"]} autoComplete="address-level2" />
                </View>
                <View style={{ width: 120 }}>
                  <Input label={dict["billing.postal"]} value={postal} onChangeText={setPostal} placeholder={dict["billing.postal_hint"]} keyboardType="number-pad" autoComplete="postal-code" />
                </View>
              </View>
              <Input label={dict["billing.country"]} value={country} onChangeText={setCountry} placeholder={dict["billing.country"]} />
            </View>
          </ScrollView>

          <View className="px-5 pb-8 pt-2 border-t border-border">
            <Button onPress={handleSave} loading={saving} icon={<Check size={18} color="#000" strokeWidth={2} />}>
              <Text className="font-semibold">{dict["billing.save"]}</Text>
            </Button>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
