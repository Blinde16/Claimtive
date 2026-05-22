import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef6ff",
          100: "#d9eaff",
          200: "#bcd9ff",
          300: "#8ec1ff",
          400: "#599eff",
          500: "#3478f6",
          600: "#1f59e0",
          700: "#1a47b8",
          800: "#1b3d92",
          900: "#1c3873",
          950: "#152347"
        }
      }
    }
  },
  plugins: []
};

export default config;
