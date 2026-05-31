import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@event/types"],
  // The serverless function size blew past Vercel's limit because the file
  // tracer pulled large build-time / native packages into the bundle. None of
  // these are needed at runtime (web talks to Supabase, not Prisma; SWC, the
  // TS compiler, Turbo and the stale Next 15.3.2 copy are build-only).
  outputFileTracingExcludes: {
    "*": [
      "**/@next/swc-*/**",
      "**/@next+swc-*/**",
      "**/next@15.3.2*/**",
      "**/@prisma/**",
      "**/@prisma+*/**",
      "**/prisma@*/**",
      "**/.prisma/**",
      "**/typescript@*/**",
      "**/typescript/lib/**",
      "**/@turbo+*/**",
      "**/@turbo/**",
      "**/@esbuild/**",
      "**/esbuild@*/**",
      "**/@swc/core*/**",
    ],
  },
  async headers() {
    return [
      {
        // Allow /widget/* to be embedded in any iframe
        source: "/widget/:path*",
        headers: [
          { key: "X-Frame-Options", value: "ALLOWALL" },
          { key: "Content-Security-Policy", value: "frame-ancestors *" },
        ],
      },
    ];
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.cloudflare.com" },
      { protocol: "https", hostname: "**.supabase.co" },
      { protocol: "https", hostname: "images.unsplash.com" },
    ],
  },
};

export default nextConfig;
