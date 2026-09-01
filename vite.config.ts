import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: "/interview-cards/",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: null,
      includeAssets: [
        "icon.svg",
        "icon-192.png",
        "icon-512.png",
        "icon-maskable-512.png",
        "apple-touch-icon.png",
      ],
      manifest: {
        name: "私有面试卡片",
        short_name: "面试卡片",
        description: "本机解密、离线可用的私有面试复习卡片",
        theme_color: "#132a24",
        background_color: "#f3efe4",
        display: "standalone",
        orientation: "portrait-primary",
        scope: "/interview-cards/",
        start_url: "/interview-cards/",
        icons: [
          {
            src: "icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "icon-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
          {
            src: "apple-touch-icon.png",
            sizes: "180x180",
            type: "image/png",
            purpose: "any",
          },
        ],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        globPatterns: ["**/*.{js,css,html,svg,png,json,webmanifest}"],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.endsWith("/cards.enc.json"),
            handler: "CacheFirst",
            options: {
              cacheName: "encrypted-card-bank-v1",
              expiration: { maxEntries: 2, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
    }),
  ],
});
