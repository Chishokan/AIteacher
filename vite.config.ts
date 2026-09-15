import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { chatApiPlugin } from './server/devApi'
import { DEFAULT_ENGINE_URL } from './server/aivis'

export default defineConfig(({ mode }) => {
  // 第3引数を空にすると、VITE_ で始まらないものも読める。
  // ここで読んだキーはサーバー側のプラグインにしか渡さない（ブラウザには出ない）
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [
      react(),
      chatApiPlugin({
        apiKey: env.ANTHROPIC_API_KEY,
        // PC で動かしている AivisSpeech。別のポートなら .env.local で変える
        engineUrl: env.AIVIS_ENGINE_URL || DEFAULT_ENGINE_URL,
        // 生徒名簿を Supabase から読む場合だけ。鍵はここから先に出ない
        supabase: {
          url: env.SUPABASE_URL,
          key: env.SUPABASE_KEY,
          table: env.SUPABASE_STUDENTS_TABLE,
        },
      }),
    ],
    base: './',
    server: {
      host: true, // 同一LAN上のタブレットから開けるようにする
      port: 5173,
    },
  }
})
