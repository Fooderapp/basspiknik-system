import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(amount);
}

export function formatDate(date: Date | string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(date));
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Stripe fee for ONE card charge: 1.5% + 25 (HUF) fixed. */
export function stripeFee(amount: number): number {
  if (amount <= 0) return 0;
  return Math.round((amount * 0.015 + 25) * 100) / 100;
}

export function estimatedPayout(gross: number, refunds = 0): number {
  const fees = stripeFee(gross);
  return Math.round((gross - fees - refunds) * 100) / 100;
}
