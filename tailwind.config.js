/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        teal: {
          50: '#F0FDF9',
          100: '#CCFBEE',
          200: '#99F6DD',
          300: '#5EEAD4',
          400: '#2DD4BF',
          500: '#14B8A6',
          600: '#0D9488',
          700: '#006754',
          800: '#005041',
          900: '#003A2F',
          950: '#00261F',
        },
        dhwani: {
          primary: '#006754',
          dark: '#004D3F',
          light: '#E6F4EA',
          mint: '#D8F3DC',
          accent: '#10B981',
          danger: '#D9381E',
          dangerLight: '#FEF2F2',
          dangerBorder: '#FCA5A5',
          warning: '#D97706',
          warningLight: '#FFFBEB',
          surface: '#F8FAFC',
          card: '#FFFFFF',
          border: '#E2E8F0',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
