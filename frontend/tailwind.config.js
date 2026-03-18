/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          primary: "hsl(24, 100%, 50%)",
          "primary-foreground": "#ffffff",
        },
        primary: {
          DEFAULT: "hsl(24, 100%, 50%)",
          foreground: "#fff",
        },
        surface: {
          base: "#f8fafc",
          raised: "#ffffff",
          subtle: "#f1f5f9",
          inverse: "#0f172a",
        },
        text: {
          primary: "#0f172a",
          secondary: "#334155",
          muted: "#64748b",
          inverse: "#f8fafc",
        },
        border: {
          DEFAULT: "#dbe2ea",
          strong: "#cbd5e1",
          subtle: "#e2e8f0",
        },
        status: {
          success: "#16a34a",
          "success-subtle": "#dcfce7",
          "success-foreground": "#166534",
          warning: "#d97706",
          "warning-subtle": "#fef3c7",
          "warning-foreground": "#92400e",
          danger: "#dc2626",
          "danger-subtle": "#fee2e2",
          "danger-foreground": "#991b1b",
          info: "#2563eb",
          "info-subtle": "#dbeafe",
          "info-foreground": "#1e40af",
          neutral: "#64748b",
          "neutral-subtle": "#f1f5f9",
          "neutral-foreground": "#334155",
        },
        focus: {
          ring: "#2563eb",
        },
        orange: {
          950: "hsl(24, 90%, 15%)",
        },
      },
    },
  },
  plugins: [],
};
