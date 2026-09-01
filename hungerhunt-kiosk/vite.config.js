import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(() => {
  const proxyTarget = process.env.VITE_DEV_PROXY_TARGET

  return {
    plugins: [react()],
    server: {
      port: 5175,
      strictPort: true,
      proxy: proxyTarget
        ? {
            '/api': {
              target: proxyTarget,
              changeOrigin: true,
            },
          }
        : undefined,
    },
  }
})
