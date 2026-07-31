/**
 * Image URL helper — routes remote images through the Next.js image optimizer.
 *
 * WHY: every `<img src={supabasePublicUrl}>` hit Supabase Storage directly, so
 * a full-resolution original was re-downloaded on *every* page view. That blew
 * through the Supabase egress quota.
 *
 * Going through `/_next/image` means Vercel fetches the original from Supabase
 * ONCE per (url, width, quality), converts it to WebP/AVIF, and serves it from
 * the edge cache thereafter. Supabase egress drops by orders of magnitude.
 *
 * Usage:  <img src={imgUrl(event.cover_image_url, 640)} />
 */

/** Widths Next.js will actually optimize — union of deviceSizes + imageSizes.
 *  Requesting anything else returns a 400 from the optimizer. */
const ALLOWED_WIDTHS = [
  16, 32, 48, 64, 96, 128, 256, 384,
  640, 750, 828, 1080, 1200, 1920, 2048, 3840,
] as const;

function snapWidth(w: number): number {
  for (const allowed of ALLOWED_WIDTHS) if (allowed >= w) return allowed;
  return ALLOWED_WIDTHS[ALLOWED_WIDTHS.length - 1];
}

/** Hosts we are allowed to optimize (must match next.config remotePatterns). */
function isOptimizable(url: string): boolean {
  if (url.startsWith("/")) return false;            // already local/static
  if (url.startsWith("data:")) return false;         // inline
  if (url.startsWith("/_next/image")) return false;  // already optimized
  try {
    const { hostname, protocol } = new URL(url);
    if (protocol !== "https:") return false;
    return (
      hostname.endsWith(".supabase.co") ||
      hostname.endsWith(".cloudflare.com") ||
      hostname === "images.unsplash.com"
    );
  } catch {
    return false;
  }
}

/**
 * Rewrite a remote image URL to a size-capped, cached, optimized one.
 *
 * @param src     original URL (may be null/undefined — passed straight through)
 * @param width   intended *rendered* CSS width in px; snapped to a Next size.
 *                Pass roughly 2× for retina-critical hero art.
 * @param quality 1–100, default 72 (visually clean, big byte savings)
 */
export function imgUrl(src: string | null | undefined, width = 640, quality = 72): string {
  if (!src) return "";
  if (!isOptimizable(src)) return src;
  const w = snapWidth(width);
  const q = Math.min(100, Math.max(1, Math.round(quality)));
  return `/_next/image?url=${encodeURIComponent(src)}&w=${w}&q=${q}`;
}

/** Absolute variant — for emails, wallet passes, and the mobile app, which
 *  cannot resolve the root-relative `/_next/image` path. */
export function imgUrlAbsolute(
  src: string | null | undefined,
  width = 640,
  quality = 72,
): string {
  if (!src) return "";
  const relative = imgUrl(src, width, quality);
  if (!relative.startsWith("/_next/image")) return relative;
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "";
  return `${base}${relative}`;
}

/** Common size presets so call sites stay consistent. */
export const IMG = {
  /** small avatars / list thumbs */
  thumb: 128,
  /** ticket-card covers, menu tiles */
  card: 640,
  /** wide banners inside content */
  banner: 1080,
  /** full-bleed hero art */
  hero: 1920,
} as const;
