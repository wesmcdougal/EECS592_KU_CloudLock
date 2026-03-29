/**
 * Vite Configuration (vite.config.js)
 *
 * Configures frontend development and build behavior. Responsibilities include:
 * - Enabling React plugin support
 * - Setting dev host binding for local testing
 * - Proxying /api calls to local backend service
 *
 * Revision History:
 * - Wesley McDougal - 29MAR2026 - Added local API proxy for frontend development
 */

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
})
