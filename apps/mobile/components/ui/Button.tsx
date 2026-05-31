import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { cn } from "@/lib/utils";
import { TextClassContext } from "@/components/ui/text";

const buttonVariants = cva(
  "flex flex-row items-center justify-center rounded-xl active:opacity-80",
  {
    variants: {
      variant: {
        default:     "bg-primary",
        destructive: "bg-destructive",
        outline:     "border border-border bg-transparent",
        secondary:   "bg-secondary",
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

const buttonTextVariants = cva("font-semibold", {
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
  ({ className, variant, size, loading, icon, disabled, children, ...props }, ref) => (
    <TextClassContext.Provider value={buttonTextVariants({ variant, size })}>
      <Pressable
        ref={ref}
        role="button"
        disabled={disabled || loading}
        className={cn(
          buttonVariants({ variant, size, className }),
          (disabled || loading) && "opacity-50",
        )}
        {...props}
      >
        {loading ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <>
            {icon && <View className="mr-2">{icon}</View>}
            {children}
          </>
        )}
      </Pressable>
    </TextClassContext.Provider>
  )
);
Button.displayName = "Button";

export { Button, buttonVariants, buttonTextVariants };
export type { ButtonProps };
