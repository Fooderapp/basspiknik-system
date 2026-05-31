import * as React from "react";
import { TextInput, View } from "react-native";
import { cn } from "@/lib/utils";
import { Text } from "@/components/ui/text";

type InputProps = React.ComponentPropsWithoutRef<typeof TextInput> & {
  label?: string;
  error?: string;
};

const Input = React.forwardRef<React.ElementRef<typeof TextInput>, InputProps>(
  ({ className, label, error, ...props }, ref) => (
    <View className="gap-1.5">
      {label && (
        <Text className="text-sm font-medium text-foreground">{label}</Text>
      )}
      <TextInput
        ref={ref}
        className={cn(
          "h-12 rounded-xl border border-input bg-card px-4 text-base text-foreground",
          "placeholder:text-muted-foreground",
          error && "border-destructive",
          props.editable === false && "opacity-50",
          className,
        )}
        placeholderTextColor="#71717a"
        {...props}
      />
      {error && (
        <Text className="text-sm text-destructive">{error}</Text>
      )}
    </View>
  )
);
Input.displayName = "Input";

export { Input };
export type { InputProps };
