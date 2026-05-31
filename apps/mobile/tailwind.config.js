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
        // ── Brand ──────────────────────────────────────────────────────────
        primary: {
          DEFAULT: "#7c3aed",
          foreground: "#ffffff",
        },
        // ── Surfaces ───────────────────────────────────────────────────────
        background: "#09090b",
        foreground: "#fafafa",
        card: {
          DEFAULT: "#18181b",
          foreground: "#fafafa",
        },
        // ── Muted ──────────────────────────────────────────────────────────
        muted: {
          DEFAULT: "#27272a",
          foreground: "#a1a1aa",
        },
        // ── Semantic ───────────────────────────────────────────────────────
        border: "#27272a",
        input: "#27272a",
        ring: "#7c3aed",
        secondary: {
          DEFAULT: "#27272a",
          foreground: "#fafafa",
        },
        accent: {
          DEFAULT: "#27272a",
          foreground: "#fafafa",
        },
        destructive: {
          DEFAULT: "#ef4444",
          foreground: "#fafafa",
        },
        success: {
          DEFAULT: "#22c55e",
          foreground: "#ffffff",
        },
        warning: {
          DEFAULT: "#f59e0b",
          foreground: "#ffffff",
        },
      },
    },
  },
  plugins: [],
};
