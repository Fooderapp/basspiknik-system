import { View, Text, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface Props {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  scroll?: boolean;
  padded?: boolean;
  right?: React.ReactNode;
}

export function Screen({ title, subtitle, children, scroll = true, padded = true, right }: Props) {
  const insets = useSafeAreaInsets();
  const Container = scroll ? ScrollView : View;

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      {title && (
        <View className="flex-row items-center justify-between px-5 pt-4 pb-3">
          <View className="flex-1">
            <Text className="text-foreground text-2xl font-bold">{title}</Text>
            {subtitle && <Text className="text-muted-foreground text-sm mt-0.5">{subtitle}</Text>}
          </View>
          {right}
        </View>
      )}
      <Container
        className="flex-1"
        contentContainerStyle={padded && scroll ? { paddingHorizontal: 20, paddingBottom: 32 } : undefined}
        style={padded && !scroll ? { paddingHorizontal: 20 } : undefined}
      >
        {children}
      </Container>
    </View>
  );
}
