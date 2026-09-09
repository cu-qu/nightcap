/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./src/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        night: {
          bg: "#0F0A1A",
          surface: "#1A1228",
          elevated: "#241833",
          border: "#3D2A55",
          muted: "#9B8BB0",
          text: "#F4EEFF",
        },
        accent: {
          DEFAULT: "#8B5CF6",
          soft: "#A78BFA",
          deep: "#6D28D9",
        },
      },
    },
  },
  plugins: [],
};
