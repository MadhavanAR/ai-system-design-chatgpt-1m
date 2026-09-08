/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        chatBg: '#212121',
        sidebarBg: '#171717',
        messageUser: '#2f2f2f',
        messageAi: '#212121',
        surface: '#2f2f2f',
        borderSubtle: '#3e3e3e',
        brand: {
          50: '#f0fdf4',
          500: '#10a37f',
          600: '#0e906f',
          700: '#0b7359',
        },
      },
    },
  },
  plugins: [],
}
