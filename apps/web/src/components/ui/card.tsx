import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const cardVariants = cva("text-card-foreground", {
  variants: {
    variant: {
      // Default shadcn card — bordered, square corners, for dashboard/admin UI
      default: "rounded-lg border bg-card shadow-sm",
      // Rounded white surface — ticket tiers, POS items, list rows
      surface: "rounded-3xl border-none bg-card shadow-sm",
      // Ink card — featured CTA / summary panels
      dark: "rounded-3xl border-none bg-[#16170F] text-white shadow-sm",
      // Pastel quadrant cards — match home/mobile pastel-card language
      "pastel-green": "rounded-3xl border-none shadow-sm bg-[var(--pastel-green)] text-[var(--pastel-green-ink)]",
      "pastel-gold": "rounded-3xl border-none shadow-sm bg-[var(--pastel-gold)] text-[var(--pastel-gold-ink)]",
      "pastel-sky": "rounded-3xl border-none shadow-sm bg-[var(--pastel-sky)] text-[var(--pastel-sky-ink)]",
      "pastel-peach": "rounded-3xl border-none shadow-sm bg-[var(--pastel-peach)] text-[var(--pastel-peach-ink)]",
      "pastel-lavender": "rounded-3xl border-none shadow-sm bg-[var(--pastel-lavender)] text-[var(--pastel-lavender-ink)]",
      "pastel-rose": "rounded-3xl border-none shadow-sm bg-[var(--pastel-rose)] text-[var(--pastel-rose-ink)]",
    },
  },
  defaultVariants: { variant: "default" },
});

export interface CardProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof cardVariants> {}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant, ...props }, ref) => (
    <div ref={ref} className={cn(cardVariants({ variant }), className)} {...props} />
  )
);
Card.displayName = "Card";

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex flex-col space-y-1.5 p-6", className)} {...props} />
  )
);
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3 ref={ref} className={cn("text-2xl font-semibold leading-none tracking-tight", className)} {...props} />
  )
);
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
  )
);
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
  )
);
CardContent.displayName = "CardContent";

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex items-center p-6 pt-0", className)} {...props} />
  )
);
CardFooter.displayName = "CardFooter";

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent };
