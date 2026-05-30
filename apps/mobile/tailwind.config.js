/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        primary: "#7c3aed",
        "primary-foreground": "#ffffff",
        background: "#09090b",
        foreground: "#fafafa",
        card: "#18181b",
        "card-foreground": "#fafafa",
        border: "#27272a",
        muted: "#27272a",
        "muted-foreground": "#a1a1aa",
        destructive: "#ef4444",
        success: "#22c55e",
        warning: "#f59e0b",
      },
    },
  },
  plugins: [],
};
