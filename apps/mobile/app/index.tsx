import { Redirect } from "expo-router";
import { View, ActivityIndicator } from "react-native";
import { useAuth } from "@/context/auth";

export default function Index() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="large" color="#fafafa" />
      </View>
    );
  }

  return <Redirect href={session ? "/(app)" : "/(auth)/login"} />;
}
