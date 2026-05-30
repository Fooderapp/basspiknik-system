import { View, Text } from "react-native";
import { cn } from "@/lib/utils";

export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <View className={cn("bg-card border border-border rounded-2xl p-4", className)}>
      {children}
    </View>
  );
}

export function CardTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return <Text className={cn("text-foreground font-semibold text-base mb-1", className)}>{children}</Text>;
}

export function CardSubtitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return <Text className={cn("text-muted-foreground text-sm", className)}>{children}</Text>;
}
