const path = require('path')

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    path.join(__dirname, 'src/**/*.{js,jsx}'),
  ],
  corePlugins: {
    preflight: false,
  },
  theme: {
    extend: {
      colors: {
        ink: '#090b14',
        'ink-2': '#12141f',
        fuchsia: '#ff4ec7',
        acid: '#b8f73a',
      },
      fontFamily: {
        display: ['Impact', 'Haettenschweiler', '"Arial Narrow Bold"', 'sans-serif'],
      },
    },
  },
}
