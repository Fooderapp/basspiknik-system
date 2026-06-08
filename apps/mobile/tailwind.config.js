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
        // ── Green-tinted design system (shared with web) ────────────────────
        // Bright Green #9FE870 = primary accent · Forest Green #163300 surfaces

        // Primary = bright green with deep forest ink
        primary: {
          DEFAULT: "#9fe870",
          foreground: "#0a1305",
        },
        // ── Surfaces ───────────────────────────────────────────────────────
        background: "#070d05",
        foreground: "#eef6e6",
        card: {
          DEFAULT: "#122d0a",
          foreground: "#eef6e6",
        },
        // ── Muted ──────────────────────────────────────────────────────────
        muted: {
          DEFAULT: "#1c2717",
          foreground: "#8da383",
        },
        // ── Semantic ───────────────────────────────────────────────────────
        border: "#25341e",
        input: "#25341e",
        ring: "#9fe870",
        secondary: {
          DEFAULT: "#1a2815",
          foreground: "#eef6e6",
        },
        accent: {
          DEFAULT: "#263919",
          foreground: "#eef6e6",
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
