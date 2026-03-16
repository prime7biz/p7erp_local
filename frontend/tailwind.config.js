/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "hsl(24, 100%, 50%)",
          foreground: "#fff",
        },
        orange: {
          950: "hsl(24, 90%, 15%)",
        },
      },
    },
  },
  plugins: [],
};
