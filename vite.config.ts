import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const base = process.env.VITE_BASE_PATH || '/'
export default defineConfig({
  base,
  plugins: [react(), VitePWA({
    registerType: 'prompt',
    includeAssets: ['icon.svg', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'],
    manifest: {
      id: base, name: 'AI Space · 你的私人 AI 空间', short_name: 'AI Space',
      description: '对话、创作与灵感，一个只属于你的 AI 空间。',
      start_url: base, scope: base, display: 'standalone',
      theme_color: '#f6f7f9', background_color: '#f6f7f9', lang: 'zh-CN',
      icons: [
        { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
      ]
    },
    workbox: { navigateFallback: 'index.html', cleanupOutdatedCaches: true, runtimeCaching: [] }
  })]
})
