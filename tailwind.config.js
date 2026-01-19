module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'eh-bg': '#34353b',
        'eh-sidebar': '#2b2c31',
        'eh-text': '#f1f1f1',
        'eh-muted': '#b4b5bc',
        'eh-panel': '#4f535b',
        'eh-border': '#5c0d11',
        'eh-accent': '#ffae00',
        'primary': '#ffae00', // Override primary for EH theme
      },
      borderColor: {
        'glass-border': '#5c0d11', // Reuse existing name but with EH color
      }
    },
  },
  plugins: [],
}
