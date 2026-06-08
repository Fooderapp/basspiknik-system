/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        // ── Monochrome base + green accent (shared with web) ────────────────
        // Surfaces black/white. Bright Green #9FE870 used as the accent only.

        // Primary = bright green accent on near-black ink
        primary: {
          DEFAULT: "#9fe870",
          foreground: "#0a1305",
        },
        // ── Surfaces (mono) ──────────────────────────────────────────────────
        background: "#000000",
        foreground: "#fafafa",
        card: {
          DEFAULT: "#0a0a0a",
          foreground: "#fafafa",
        },
        // ── Muted (mono) ─────────────────────────────────────────────────────
        muted: {
          DEFAULT: "#171717",
          foreground: "#8f8f8f",
        },
        // ── Semantic ───────────────────────────────────────────────────────
        border: "#262626",
        input: "#262626",
        ring: "#9fe870",
        secondary: {
          DEFAULT: "#171717",
          foreground: "#fafafa",
        },
        accent: {
          DEFAULT: "#1f1f1f",
          foreground: "#fafafa",
        },
        destructive: {
          DEFAULT: "#d23f3f",
          foreground: "#ffffff",
        },
        success: {
          DEFAULT: "#9fe870",
          foreground: "#0a1305",
        },
        warning: {
          DEFAULT: "#f59e0b",
          foreground: "#000000",
        },
      },
    },
  },
  plugins: [],
};
