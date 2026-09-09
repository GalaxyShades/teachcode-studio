import type { Config } from "tailwindcss";
export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: { extend: { colors: { teal: { 600: "#0f766e", 700: "#0d5f59" } } } },
  plugins: [],
} satisfies Config;
