import { Stack } from "expo-router";

export default function HomeStack() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#141414" } }}>
      <Stack.Screen name="index" />
    </Stack>
  );
}
