import Stripe from "stripe";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-02-24.acacia",
  typescript: true,
});

export function formatStripeAmount(amount: number): number {
  return Math.round(amount * 100);
}

export function parseStripeAmount(amount: number): number {
  return amount / 100;
}
