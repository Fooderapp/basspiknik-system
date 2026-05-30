import { TouchableOpacity, Text, ActivityIndicator, View } from "react-native";
import { cn } from "@/lib/utils";

interface Props {
  onPress?: () => void;
  children: React.ReactNode;
  variant?: "primary" | "outline" | "ghost" | "destructive" | "success";
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  icon?: React.ReactNode;
}

const variantClasses = {
  primary:     "bg-primary border border-primary",
  outline:     "bg-transparent border border-border",
  ghost:       "bg-transparent border border-transparent",
  destructive: "bg-destructive border border-destructive",
  success:     "bg-success border border-success",
};

const textClasses = {
  primary:     "text-white",
  outline:     "text-foreground",
  ghost:       "text-foreground",
  destructive: "text-white",
  success:     "text-white",
};

const sizeClasses = {
  sm: "px-3 py-2 rounded-lg",
  md: "px-4 py-3 rounded-xl",
  lg: "px-5 py-4 rounded-xl",
};

const textSizeClasses = {
  sm: "text-sm",
  md: "text-base",
  lg: "text-base",
};

export function Button({
  onPress, children, variant = "primary", size = "md",
  disabled, loading, fullWidth, icon,
}: Props) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.75}
      className={cn(
        "flex-row items-center justify-center gap-2",
        variantClasses[variant],
        sizeClasses[size],
        fullWidth && "w-full",
        (disabled || loading) && "opacity-50",
      )}
    >
      {loading
        ? <ActivityIndicator size="small" color="#fff" />
        : (
          <>
            {icon && <View>{icon}</View>}
            <Text className={cn("font-semibold", textClasses[variant], textSizeClasses[size])}>
              {children}
            </Text>
          </>
        )
      }
    </TouchableOpacity>
  );
}
