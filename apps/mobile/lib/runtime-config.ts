/**
 * Module-level runtime config fetched from /api/public-config at app start.
 * Avoids prop-drilling or context for values needed deep in the tree (e.g.
 * the seller screen needs stripeSimulated without passing it through layouts).
 */

export const runtimeConfig = {
  stripePublishableKey: process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "",
  stripeTerminalLocationId: process.env.EXPO_PUBLIC_STRIPE_LOCATION_ID ?? "",
  stripeSimulated: process.env.EXPO_PUBLIC_STRIPE_SIMULATED === "true",
  appUrl: process.env.EXPO_PUBLIC_APP_URL ?? "",
};

export function applyPublicConfig(cfg: {
  stripePublishableKey?: string | null;
  stripeTerminalLocationId?: string | null;
  stripeSimulated?: boolean | null;
  appUrl?: string | null;
}) {
  if (cfg.stripePublishableKey) runtimeConfig.stripePublishableKey = cfg.stripePublishableKey;
  if (cfg.stripeTerminalLocationId) runtimeConfig.stripeTerminalLocationId = cfg.stripeTerminalLocationId;
  if (cfg.stripeSimulated != null) runtimeConfig.stripeSimulated = cfg.stripeSimulated;
  if (cfg.appUrl) runtimeConfig.appUrl = cfg.appUrl;
}
