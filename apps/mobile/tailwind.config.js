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
        // ── Deep dark-grey base · gold CTA · green status (shared w/ web) ────
        // 60 dark grey · 30 secondary grey · 10 accent (gold + green)

        // Brand accents
        brand: {
          DEFAULT: "#9fe870", // bright green — positive status
          foreground: "#0a1305",
        },
        forest: "#163300", // forest green surface
        gold: {
          DEFAULT: "#EBE05A", // CTA / pills / slider thumb
          foreground: "#323000",
        },
        // Primary = gold CTA
        primary: {
          DEFAULT: "#EBE05A",
          foreground: "#323000",
        },
        // ── Surfaces (deep dark grey) ─────────────────────────────────────────
        background: "#141414",
        foreground: "#f5f5f5",
        card: {
          DEFAULT: "#1f1f1f",
          foreground: "#f5f5f5",
        },
        // ── Muted ────────────────────────────────────────────────────────────
        muted: {
          DEFAULT: "#262626",
          foreground: "#9a9a9a",
        },
        // ── Semantic ───────────────────────────────────────────────────────
        border: "#303030",
        input: "#303030",
        ring: "#EBE05A",
        secondary: {
          DEFAULT: "#2b2b2b",
          foreground: "#f5f5f5",
        },
        accent: {
          DEFAULT: "#303030",
          foreground: "#f5f5f5",
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
