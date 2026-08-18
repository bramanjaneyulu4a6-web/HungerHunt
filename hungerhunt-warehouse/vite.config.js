import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Pinned: the backend's CORS allowlist is a hardcoded list of origins, and
  // 5176 is the warehouse app's entry in it. Vite's default port-increment
  // would land wherever the other three apps left off.
  server: { port: 5176, strictPort: true },
})
