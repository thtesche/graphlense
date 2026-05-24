import fs from 'fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

let httpsConfig = false;
try {
  httpsConfig = {
    key: fs.readFileSync('./certs/atlantis+2-key.pem'),
    cert: fs.readFileSync('./certs/atlantis+2.pem')
  };
} catch (e) {
  console.warn('Local certs not found, starting without HTTPS in dev mode.');
}

// https://vitejs.dev/config/
export default defineConfig({
  server: { 
    https: httpsConfig,
    host: '0.0.0.0'
  },
  plugins: [react()],
  base: '/graphstation/', // Explicitly match the Synology Alias
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/setupTests.js'
  }
})
