import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: process.env.VITE_TEST_MODE
      ? {
          '@wailsio/runtime': path.resolve(__dirname, 'src/wails-mock-runtime.ts'),
        }
      : {},
  },
})
