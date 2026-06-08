import { Stack } from "expo-router";

export default function TicketsStack() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#141414" } }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="[id]" options={{ presentation: "modal" }} />
      <Stack.Screen name="transfer" options={{ presentation: "modal" }} />
    </Stack>
  );
}
