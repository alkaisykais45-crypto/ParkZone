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
        app: {
          bg: "#F4F4F6",
          bgDark: "#000000",
          surface: "#FFFFFF",
          surfaceDark: "#121215",
          primary: "#09090B",
          primaryDark: "#FFFFFF",
          secondary: "#71717A",
          muted: "#A1A1AA",
          pill: "#E4E4E7",
          ev: "#10B981",
          evSoft: "#ECFDF5",
          danger: "#EF4444",
        },
      },
    },
  },
  plugins: [],
};
