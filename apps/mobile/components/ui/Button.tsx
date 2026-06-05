import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { cn } from "@/lib/utils";
import { TextClassContext } from "@/components/ui/text";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const buttonVariants = cva(
  "flex flex-row items-center justify-center rounded-xl active:opacity-70",
  {
    variants: {
      variant: {
        default:     "bg-primary",
        destructive: "bg-destructive",
        outline:     "border border-border bg-transparent",
        secondary:   "bg-secondary border border-border",
        ghost:       "bg-transparent",
        success:     "bg-success",
      },
      size: {
        default: "h-12 px-5",
        sm:      "h-9 px-4 rounded-lg",
        lg:      "h-14 px-8",
        icon:    "h-10 w-10",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);

const buttonTextVariants = cva("font-semibold tracking-tight", {
  variants: {
    variant: {
      default:     "text-primary-foreground",
      destructive: "text-destructive-foreground",
      outline:     "text-foreground",
      secondary:   "text-secondary-foreground",
      ghost:       "text-foreground",
      success:     "text-success-foreground",
    },
    size: {
      default: "text-base",
      sm:      "text-sm",
      lg:      "text-lg",
      icon:    "text-base",
    },
  },
  defaultVariants: { variant: "default", size: "default" },
});

type ButtonProps = React.ComponentPropsWithoutRef<typeof Pressable> &
  VariantProps<typeof buttonVariants> & {
    loading?: boolean;
    icon?: React.ReactNode;
  };

const Button = React.forwardRef<React.ElementRef<typeof Pressable>, ButtonProps>(
  ({ className, variant, size, loading, icon, disabled, children, onPressIn, onPressOut, ...props }, ref) => {
    // White-bg variants need a dark spinner; dark variants need a light one.
    const spinnerColor =
      variant === "outline" || variant === "secondary" || variant === "ghost"
        ? "#fafafa"
        : "#000000";

    // Press-scale micro-interaction
    const scale = useSharedValue(1);
    const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
    const isLocked = disabled || loading;

    return (
    <TextClassContext.Provider value={buttonTextVariants({ variant, size })}>
      <AnimatedPressable
        ref={ref}
        role="button"
        disabled={isLocked}
        style={animStyle}
        onPressIn={(e) => { if (!isLocked) scale.value = withSpring(0.95, { damping: 15, stiffness: 320 }); onPressIn?.(e); }}
        onPressOut={(e) => { scale.value = withSpring(1, { damping: 12, stiffness: 280 }); onPressOut?.(e); }}
        className={cn(
          buttonVariants({ variant, size, className }),
          isLocked && "opacity-40",
        )}
        {...props}
      >
        {loading ? (
          <ActivityIndicator size="small" color={spinnerColor} />
        ) : (
          <>
            {icon && <View className="mr-2">{icon}</View>}
            {children}
          </>
        )}
      </AnimatedPressable>
    </TextClassContext.Provider>
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants, buttonTextVariants };
export type { ButtonProps };
