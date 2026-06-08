import { Stack } from "expo-router";

export default function MenuStack() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#141414" } }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="order" options={{ presentation: "modal" }} />
    </Stack>
  );
}
