import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { versionStampPlugin } from '../scripts/versionStampPlugin.mjs'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), versionStampPlugin()],
})
