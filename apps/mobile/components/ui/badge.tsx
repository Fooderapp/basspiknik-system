import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { View } from "react-native";
import { cn } from "@/lib/utils";
import { Text } from "@/components/ui/text";

const badgeVariants = cva(
  "flex flex-row items-center rounded-full px-2.5 py-0.5",
  {
    variants: {
      variant: {
        default:     "bg-primary",
        secondary:   "bg-secondary",
        destructive: "bg-destructive",
        outline:     "border border-border bg-transparent",
        success:     "bg-success",
        muted:       "bg-muted",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

const badgeTextVariants = cva("text-xs font-semibold", {
  variants: {
    variant: {
      default:     "text-primary-foreground",
      secondary:   "text-secondary-foreground",
      destructive: "text-destructive-foreground",
      outline:     "text-foreground",
      success:     "text-success-foreground",
      muted:       "text-muted-foreground",
    },
  },
  defaultVariants: { variant: "default" },
});

type BadgeProps = React.ComponentPropsWithoutRef<typeof View> &
  VariantProps<typeof badgeVariants> & {
    label: string;
  };

function Badge({ className, variant, label, ...props }: BadgeProps) {
  return (
    <View className={cn(badgeVariants({ variant, className }))} {...props}>
      <Text className={badgeTextVariants({ variant })}>{label}</Text>
    </View>
  );
}

export { Badge, badgeVariants };
export type { BadgeProps };
