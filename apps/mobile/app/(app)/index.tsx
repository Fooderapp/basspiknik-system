import { Redirect } from "expo-router";
import { View, ActivityIndicator } from "react-native";
import { useAuth } from "@/context/auth";

// Everyone lands in the tab UI. Staff reach POS / Check-in / Bartender from the
// role-gated section inside the Profile tab.
export default function AppIndex() {
  const { profile, loading } = useAuth();

  if (loading || !profile) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="large" color="#fafafa" />
      </View>
    );
  }

  return <Redirect href={"/(app)/home" as never} />;
}
