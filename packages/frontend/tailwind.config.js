/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: '#0a1628',
        secondary: '#1b2a4a',
        accent: '#e63946',
        gold: '#ffd60a',
        usblue: '#1d4ed8',
        usred: '#dc2626',
      },
    },
  },
  plugins: [],
};
