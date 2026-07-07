import type { Config } from "tailwindcss";

// Deliberately plain. Internal-admin-tool look: dense tables, forms, buttons.
// No design-system polish, no animations.
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};

export default config;
