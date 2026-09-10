import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    host: true, // 同一LAN上のタブレットから開けるようにする
    port: 5173,
  },
})
