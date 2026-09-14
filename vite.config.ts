import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { chatApiPlugin } from './server/devApi'

export default defineConfig(({ mode }) => {
  // 第3引数を空にすると、VITE_ で始まらないものも読める。
  // ここで読んだキーはサーバー側のプラグインにしか渡さない（ブラウザには出ない）
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react(), chatApiPlugin(env.ANTHROPIC_API_KEY)],
    base: './',
    server: {
      host: true, // 同一LAN上のタブレットから開けるようにする
      port: 5173,
    },
  }
})
