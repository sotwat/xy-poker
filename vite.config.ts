import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fontPreviewPlugin } from './scripts/fontPreviewPlugin'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), fontPreviewPlugin()],
  build: {
    target: 'es2022',
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'supabase-vendor': ['@supabase/supabase-js'],
          'realtime-vendor': ['socket.io-client'],
        },
      },
    },
  },
})
