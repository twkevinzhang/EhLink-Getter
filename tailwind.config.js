module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'eh-bg': '#f2efdf',       // Earthy tan main background
        'eh-sidebar': '#e3e0d1',   // Slightly darker tan for sidebar/panels
        'eh-text': '#5c0d11',      // Classic reddish-brown for titles and links
        'eh-muted': '#444444',     // Muted gray for normal text
        'eh-panel': '#edeae0',     // Lighter tan for card/container backgrounds
        'eh-border': '#5c0d11',    // Iconic deep red border
        'eh-accent': '#f11d1d',    // Category-specific or highlight red
        'primary': '#5c0d11',      // Primary actions use the red
        
        // EH Category Colors
        'eh-cat-doujinshi': '#ff5e47',
        'eh-cat-manga': '#fcb417',
        'eh-cat-artistcg': '#fcf116',
        'eh-cat-gamecg': '#00de21',
        'eh-cat-western': '#5cc800',
        'eh-cat-nonh': '#00bcf2',
        'eh-cat-imageset': '#3a59f7',
        'eh-cat-cosplay': '#a152fb',
        'eh-cat-asianporn': '#fe5ed8',
        'eh-cat-misc': '#999999',
      },
    },
  },
  plugins: [],
}
