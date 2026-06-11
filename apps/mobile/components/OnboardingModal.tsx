import { useState } from "react";
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, View } from "react-native";
import { PartyPopper, User, MapPin, ChevronRight, ChevronLeft, Check, X } from "lucide-react-native";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/auth";

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Called once billing is saved successfully. */
  onComplete: () => void;
}

const isValidEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

export function OnboardingModal({ visible, onClose, onComplete }: Props) {
  const { profile, refreshProfile } = useAuth();
  const [step, setStep] = useState<1 | 2>(1);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState(profile?.name ?? "");
  const [email, setEmail] = useState(profile?.email ?? "");
  const [billingName, setBillingName] = useState(profile?.billing_name ?? profile?.name ?? "");
  const [address, setAddress] = useState(profile?.billing_address ?? "");
  const [city, setCity] = useState(profile?.billing_city ?? "");
  const [postal, setPostal] = useState(profile?.billing_postal_code ?? "");
  const [country, setCountry] = useState(profile?.billing_country ?? "Magyarország");

  function nextFromStep1() {
    if (!name.trim()) { Alert.alert("Hold on", "Please enter your name."); return; }
    if (!isValidEmail(email)) { Alert.alert("Hold on", "Please enter a valid email."); return; }
    setStep(2);
  }

  async function save() {
    if (!profile) return;
    if (!billingName.trim() || !address.trim() || !city.trim() || !postal.trim() || !country.trim()) {
      Alert.alert("Almost there", "Please fill in all billing fields.");
      return;
    }
    setSaving(true);
    try {
      const { error } = await (supabase as any)
        .from("profiles")
        .update({
          name: name.trim(),
          email: email.trim(),
          billing_name: billingName.trim(),
          billing_address: address.trim(),
          billing_city: city.trim(),
          billing_postal_code: postal.trim(),
          billing_country: country.trim(),
          onboarded_at: new Date().toISOString(),
        })
        .eq("id", profile.id);
      if (error) throw error;
      await refreshProfile();
      onComplete();
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "Could not save your details.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View className="flex-1 bg-background">
        {/* Header */}
        <View className="flex-row items-center justify-between px-5 pt-5 pb-3">
          <View className="flex-row items-center gap-2">
            <View className="w-9 h-9 rounded-xl items-center justify-center bg-primary">
              <PartyPopper size={18} color="#000" strokeWidth={2} />
            </View>
            <Text className="text-foreground font-bold text-lg tracking-tight">
              {step === 1 ? "Let's get you set up" : "Billing details"}
            </Text>
          </View>
          <Pressable onPress={onClose} className="active:opacity-60 p-1">
            <X size={22} color="#8f8f8f" strokeWidth={2} />
          </Pressable>
        </View>

        {/* Step indicator */}
        <View className="flex-row gap-2 px-5 pb-4">
          <View className={`h-1.5 flex-1 rounded-full ${step >= 1 ? "bg-primary" : "bg-muted"}`} />
          <View className={`h-1.5 flex-1 rounded-full ${step >= 2 ? "bg-primary" : "bg-muted"}`} />
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          className="flex-1"
        >
          <ScrollView className="flex-1 px-5" contentContainerStyle={{ paddingBottom: 24 }}>
            {step === 1 ? (
              <View className="gap-4">
                <View className="flex-row items-center gap-2 mb-1">
                  <User size={16} color="#8f8f8f" strokeWidth={1.75} />
                  <Text className="text-muted-foreground text-sm">
                    Just a couple of things so your tickets land in the right place.
                  </Text>
                </View>
                <Input label="Full name" value={name} onChangeText={setName} autoComplete="name" placeholder="Your name" />
                <Input
                  label="Email"
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  autoComplete="email"
                  placeholder="you@example.com"
                />
                <Text className="text-muted-foreground text-xs">
                  Tickets and receipts are sent to this email.
                </Text>
              </View>
            ) : (
              <View className="gap-4">
                <View className="flex-row items-center gap-2 mb-1">
                  <MapPin size={16} color="#8f8f8f" strokeWidth={1.75} />
                  <Text className="text-muted-foreground text-sm">
                    Needed for your invoice. We only ask once.
                  </Text>
                </View>
                <Input label="Billing name" value={billingName} onChangeText={setBillingName} placeholder="Name on invoice" />
                <Input label="Address" value={address} onChangeText={setAddress} placeholder="Street and number" />
                <View className="flex-row gap-3">
                  <View className="flex-1">
                    <Input label="City" value={city} onChangeText={setCity} placeholder="City" />
                  </View>
                  <View style={{ width: 120 }}>
                    <Input label="Postal code" value={postal} onChangeText={setPostal} placeholder="0000" keyboardType="number-pad" />
                  </View>
                </View>
                <Input label="Country" value={country} onChangeText={setCountry} placeholder="Country" />
              </View>
            )}
          </ScrollView>

          {/* Footer */}
          <View className="px-5 pb-8 pt-2 gap-2 border-t border-border">
            {step === 1 ? (
              <Button onPress={nextFromStep1} icon={<ChevronRight size={18} color="#000" strokeWidth={2} />}>
                <Text className="font-semibold">Continue</Text>
              </Button>
            ) : (
              <>
                <Button onPress={save} loading={saving} icon={<Check size={18} color="#000" strokeWidth={2} />}>
                  <Text className="font-semibold">Save & continue</Text>
                </Button>
                <Button variant="ghost" onPress={() => setStep(1)} disabled={saving} icon={<ChevronLeft size={16} color="#14160F" strokeWidth={1.75} />}>
                  <Text>Back</Text>
                </Button>
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
