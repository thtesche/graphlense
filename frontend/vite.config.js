import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/graphstation/', // Explicitly match the Synology Alias
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/setupTests.js'
  }
})
