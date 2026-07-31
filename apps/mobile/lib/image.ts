/**
 * Image URL helper for the mobile app.
 *
 * WHY: `<Image source={{ uri: supabasePublicUrl }} />` downloads the ORIGINAL
 * full-resolution file from Supabase Storage on every cache miss. On phone
 * screens that is wildly oversized and it burned through the Supabase egress
 * quota.
 *
 * Routing through the web app's Next.js image optimizer means Vercel fetches
 * the original from Supabase once, converts it to WebP at the requested width,
 * and serves every subsequent request from its edge cache.
 *
 * Mirrors apps/web/src/lib/image.ts — keep the two in sync.
 */

const APP_URL = process.env.EXPO_PUBLIC_APP_URL ?? "";

/** Widths the Next.js optimizer accepts (deviceSizes + imageSizes). */
const ALLOWED_WIDTHS = [
  16, 32, 48, 64, 96, 128, 256, 384,
  640, 750, 828, 1080, 1200, 1920, 2048, 3840,
];

function snapWidth(w: number): number {
  for (const allowed of ALLOWED_WIDTHS) if (allowed >= w) return allowed;
  return ALLOWED_WIDTHS[ALLOWED_WIDTHS.length - 1];
}

function isOptimizable(url: string): boolean {
  if (!url.startsWith("https://")) return false;
  return (
    url.includes(".supabase.co/") ||
    url.includes(".cloudflare.com/") ||
    url.includes("images.unsplash.com/")
  );
}

/**
 * @param src     original URL (null/undefined → undefined, safe for <Image>)
 * @param width   intended rendered width in px (pass ~2× for retina)
 * @param quality 1–100, default 72
 */
export function imgUri(
  src: string | null | undefined,
  width = 640,
  quality = 72,
): string | undefined {
  if (!src) return undefined;
  // No app URL configured, or a host we can't optimize → use the original.
  if (!APP_URL || !isOptimizable(src)) return src;
  const w = snapWidth(width);
  const q = Math.min(100, Math.max(1, Math.round(quality)));
  return `${APP_URL}/_next/image?url=${encodeURIComponent(src)}&w=${w}&q=${q}`;
}

/** Size presets — phone-appropriate, already retina-doubled. */
export const IMG = {
  thumb: 256,
  card: 750,
  hero: 1080,
} as const;
