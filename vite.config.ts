import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
export default defineConfig({
  resolve: { alias: { '@': new URL('./src', import.meta.url).pathname } },
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        id: '/',
        name: '棋聚 Kee Club',
        short_name: '棋聚',
        description: '和朋友一起玩鬥獸棋、飛行棋，或挑戰 AI。',
        lang: 'zh-Hant',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        theme_color: '#f5f3eb',
        background_color: '#f5f3eb',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackAllowlist: [
          /^\/$/,
          /^\/room\/[A-Za-z2-9]{6}\/?$/,
          /^\/local\/[a-f0-9-]+\/?$/,
        ],
        // Only the app shell is cached. API requests and game actions stay on the network.
        runtimeCaching: [],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  server: {
    host: '0.0.0.0',
    port: 3000,
    strictPort: true,
    proxy: {
      '/api': { target: 'http://127.0.0.1:3001', ws: true },
      '/ws': { target: 'ws://127.0.0.1:3001', ws: true },
    },
  },
});
