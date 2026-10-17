import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // The runnable host harness follows current SDK source without a stale dist build.
  resolve: { alias: [
    { find: '@smartdoca/canvas/style.css', replacement: new URL('./src/index.css', import.meta.url).pathname },
    { find: '@smartdoca/canvas/model', replacement: new URL('./src/model/index.ts', import.meta.url).pathname },
    { find: '@smartdoca/canvas/io', replacement: new URL('./src/io/index.ts', import.meta.url).pathname },
    { find: '@smartdoca/canvas', replacement: new URL('./src/index.ts', import.meta.url).pathname },
  ] },
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: true, // 允许所有host访问
  },
})
