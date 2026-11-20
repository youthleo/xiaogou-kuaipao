import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vite'

// 部署子路径：本地开发默认 '/'；GitHub Pages 构建时由工作流设置
// VITE_APP_BASE=/xiaogou-kuaipao/，manifest 的 start_url/scope/图标也跟着走。
const base = process.env.VITE_APP_BASE ?? '/'

// https://vite.dev/config/
export default defineConfig({
  base,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icon.svg', 'icon-192.png', 'icon-512.png', 'icon-512-maskable.png', 'apple-touch-icon.png'],
      manifest: {
        id: base,
        name: '小狗快跑',
        short_name: '小狗快跑',
        description: '个人自玩版 LBS 跑步圈地：跑步画圈，占领你的地盘。',
        lang: 'zh-CN',
        dir: 'ltr',
        categories: ['sports', 'health', 'games'],
        theme_color: '#0A0A0A',
        background_color: '#0A0A0A',
        display: 'standalone',
        orientation: 'portrait',
        start_url: base,
        scope: base,
        icons: [
          { src: `${base}icon-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: `${base}icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: `${base}icon-512-maskable.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // 离线可用的基础壳：预缓存应用文件，地图瓦片按需缓存 7 天
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/server\.arcgisonline\.com\/.*/i,
            handler: 'CacheFirst',
            options: { cacheName: 'esri-tiles', expiration: { maxEntries: 500, maxAgeSeconds: 7 * 24 * 3600 } },
          },
        ],
      },
      // 开发服务器也注册 Service Worker，手机上直接装开发版就能验证安装效果
      devOptions: { enabled: true, type: 'module' },
    }),
  ],
  server: { host: '0.0.0.0', port: 5173 },
  preview: { host: '0.0.0.0', port: 5173 },
})
