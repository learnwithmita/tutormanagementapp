import type { Config } from "tailwindcss";

// Premium, Apple-inspired design tokens. Restrained palette, generous radius,
// soft depth. Typography uses the system stack, which renders San Francisco on
// the tutor's own Apple devices.
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        canvas: "#f5f5f7",
        surface: "#ffffff",
        line: "#e6e6ea",
        ink: {
          DEFAULT: "#1d1d1f",
          soft: "#6e6e73",
          faint: "#8e8e93",
        },
        accent: {
          DEFAULT: "#0071e3",
          dark: "#0060c0",
          soft: "#e8f1fe",
        },
      },
      borderRadius: {
        lg: "0.7rem",
        xl: "0.95rem",
        "2xl": "1.25rem",
      },
      boxShadow: {
        card: "0 1px 2px rgba(0,0,0,0.04), 0 10px 30px rgba(0,0,0,0.05)",
        pop: "0 12px 40px rgba(0,0,0,0.14)",
        focus: "0 0 0 4px rgba(0,113,227,0.18)",
      },
      fontSize: {
        "2xs": ["0.6875rem", { lineHeight: "1rem" }],
      },
    },
  },
  plugins: [],
};

export default config;
