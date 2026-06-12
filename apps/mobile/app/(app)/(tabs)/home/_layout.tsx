import { Stack } from "expo-router";

export default function HomeStack() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#F6F5EE" } }}>
      <Stack.Screen name="index" />
    </Stack>
  );
}
