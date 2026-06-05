import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import tailwindcss from 'tailwindcss'
import autoprefixer from 'autoprefixer'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  root: __dirname,
  publicDir: false,
  plugins: [react()],
  css: {
    postcss: {
      plugins: [
        tailwindcss({ config: resolve(__dirname, 'tailwind.config.cjs') }),
        autoprefixer(),
      ],
    },
  },
  build: {
    outDir: resolve(__dirname, '../public/hero'),
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, 'src/main.jsx'),
      output: {
        entryFileNames: 'hero.js',
        assetFileNames: (info) => (info.name?.endsWith('.css') ? 'hero.css' : '[name][extname]'),
        format: 'es',
      },
    },
  },
})
