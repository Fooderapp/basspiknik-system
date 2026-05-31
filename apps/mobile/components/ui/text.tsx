import * as React from "react";
import { Text as RNText } from "react-native";
import { cn } from "@/lib/utils";

export const TextClassContext = React.createContext<string | undefined>(undefined);

type TextProps = React.ComponentPropsWithoutRef<typeof RNText>;

const Text = React.forwardRef<React.ElementRef<typeof RNText>, TextProps>(
  ({ className, ...props }, ref) => {
    const textClass = React.useContext(TextClassContext);
    return (
      <RNText
        className={cn("text-base text-foreground", textClass, className)}
        ref={ref}
        {...props}
      />
    );
  }
);
Text.displayName = "Text";

export { Text };
