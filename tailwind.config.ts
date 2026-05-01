import type { Config } from "tailwindcss";

export default {
  darkMode: "class",
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        cyan: "#00F2FE",
        blue: "#4FACFE",
        surface: "#0B131E",
        background: "#050A10"
      },
      boxShadow: {
        neon: "0 0 24px rgba(0, 242, 254, 0.12)"
      },
      borderRadius: {
        "2xl": "1rem"
      }
    }
  },
  plugins: []
} satisfies Config;

