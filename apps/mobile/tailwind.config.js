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

        // ─────────────────────────────────────────────────────────────────────
        // LIGHT PASTEL SYSTEM (additive — screens migrate onto this, then the
        // base surfaces above flip to it). Brand-tinted: warm cream + ink, soft
        // pastel quadrant cards derived from the green/gold brand + complements.
        // ─────────────────────────────────────────────────────────────────────
        cream: {
          DEFAULT: "#F6F5EE", // warm off-white app background
          deep: "#ECEADD",    // slightly darker cream for chips / secondary
        },
        ink: {
          DEFAULT: "#14160F", // near-black warm headline ink
          soft: "#6B6F63",    // muted body / labels
          faint: "#9CA093",   // hint text
        },
        surface: "#FFFFFF",   // white cards / circular icon buttons
        pill: "#16170F",      // dark pill nav / focal buttons
        // Pastel quadrant fills + their on-color (icon/text ink)
        pastel: {
          green:    "#DDF2C6", "green-ink":    "#2C3A18",
          gold:     "#F7EFC0", "gold-ink":     "#3A3608",
          sky:      "#D6E7F5", "sky-ink":      "#15324A",
          peach:    "#F8DEC2", "peach-ink":    "#4A2E12",
          lavender: "#E7DFF6", "lavender-ink": "#2E2350",
          rose:     "#F6D9DE", "rose-ink":     "#4A1820",
        },
      },
    },
  },
  plugins: [],
};
