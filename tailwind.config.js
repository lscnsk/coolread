export default {
  // Hover looks only on devices with a real mouse: on a touch screen a tapped button
  // otherwise stays lit until you tap somewhere else.
  future: { hoverOnlyWhenSupported: true },
  content: [
    "./index.html",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./hooks/**/*.{js,ts,jsx,tsx}",
    "./utils/**/*.{js,ts,jsx,tsx}",
    "./App.tsx",
    "./index.tsx"
  ],
  theme: {
    extend: {
      fontFamily: {
        serif: ['Literata', 'serif'],
        literata: ['Literata', 'serif'],
        bimbo: ['"Dancing Script"', 'cursive'],
        ff: ['"Cinzel"', 'serif'],
        dragon: ['"Uncial Antiqua"', 'cursive'],
        surf: ['"Caveat"', 'cursive'],
        marcel: ['"Parisienne"', 'cursive'],
      }
    },
  },
  plugins: [],
}
