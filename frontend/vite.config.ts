import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Frontend always calls relative /api/... paths. In dev this proxies to the Flask
      // dev server; in prod the built bundle is served same-origin by Flask, so no proxy
      // (and no CORS) is ever needed either way.
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
})
