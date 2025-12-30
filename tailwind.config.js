/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/renderer/index.html",
    "./src/renderer/src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: '#6366f1',
        'bg-dark': '#0f172a',
        'bg-sidebar': '#1e293b',
        'glass-bg': 'rgba(255, 255, 255, 0.05)',
        'glass-border': 'rgba(255, 255, 255, 0.1)',
        'text-main': '#f8fafc',
        'text-muted': '#94a3b8',
      },
      backdropBlur: {
        'xs': '2px',
      }
    },
  },
  plugins: [],
}
