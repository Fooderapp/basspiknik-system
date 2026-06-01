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
        // ── Monochrome design system ───────────────────────────────────────
        // Pure black/white. No accent hues. Hierarchy via tone + borders.

        // Primary = high-contrast white on black (inverted emphasis)
        primary: {
          DEFAULT: "#ffffff",
          foreground: "#000000",
        },
        // ── Surfaces ───────────────────────────────────────────────────────
        background: "#000000",
        foreground: "#fafafa",
        card: {
          DEFAULT: "#0a0a0a",
          foreground: "#fafafa",
        },
        // ── Muted ──────────────────────────────────────────────────────────
        muted: {
          DEFAULT: "#171717",
          foreground: "#8f8f8f",
        },
        // ── Semantic (mono) ────────────────────────────────────────────────
        border: "#262626",
        input: "#262626",
        ring: "#ffffff",
        secondary: {
          DEFAULT: "#171717",
          foreground: "#fafafa",
        },
        accent: {
          DEFAULT: "#1f1f1f",
          foreground: "#fafafa",
        },
        // Destructive/success/warning kept mono so existing classes stay B&W.
        // Meaning is carried by icons + copy, not colour.
        destructive: {
          DEFAULT: "#fafafa",
          foreground: "#000000",
        },
        success: {
          DEFAULT: "#fafafa",
          foreground: "#000000",
        },
        warning: {
          DEFAULT: "#171717",
          foreground: "#fafafa",
        },
      },
    },
  },
  plugins: [],
};
