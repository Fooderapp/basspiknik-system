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
        // Primary = brand green CTA
        primary: {
          DEFAULT: "#9FE870",
          foreground: "#0a1305",
        },
        // ── Surfaces (warm cream / white — pastel light system) ───────────────
        background: "#F6F5EE",
        foreground: "#14160F",
        card: {
          DEFAULT: "#FFFFFF",
          foreground: "#14160F",
        },
        // ── Muted ────────────────────────────────────────────────────────────
        muted: {
          DEFAULT: "#ECEADD",
          foreground: "#6B6F63",
        },
        // ── Semantic ───────────────────────────────────────────────────────
        border: "#E6E4D8",
        input: "#E6E4D8",
        ring: "#9FE870",
        secondary: {
          DEFAULT: "#ECEADD",
          foreground: "#14160F",
        },
        accent: {
          DEFAULT: "#ECEADD",
          foreground: "#14160F",
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
