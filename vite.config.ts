import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico", "robots.txt", "sw.js"],
      manifest: {
        name: "Hey Hey - Inbox Multi-Plataforma",
        short_name: "Hey Hey",
        description: "Gestiona WhatsApp, Messenger, Instagram y TikTok en una sola bandeja",
        theme_color: "#25D366",
        background_color: "#ffffff",
        display: "standalone",
        orientation: "portrait",
        start_url: "/dashboard",
        scope: "/",
        icons: [
          {
            src: "/pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "/pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        // Don't precache sw.js as we manage it manually
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api/, /^\/sw\.js$/],
        runtimeCaching: [
          // IMPORTANT: Never cache auth endpoints. Caching /auth/v1/token can break
          // refresh token rotation and cause users to get logged out when reopening the PWA.
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/auth\/v1\/token.*/i,
            handler: "NetworkOnly",
            method: "POST",
          },
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/auth\/v1\/user.*/i,
            handler: "NetworkOnly",
          },
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/auth\/v1\/logout.*/i,
            handler: "NetworkOnly",
            method: "POST",
          },
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
            handler: "NetworkFirst",
            options: {
              // Bump cache name to avoid reusing any previously cached auth responses
              // from older service worker versions.
              cacheName: "supabase-cache-v2",
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60, // 1 hour
              },
              networkTimeoutSeconds: 10,
            },
          },
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/realtime\/.*/i,
            handler: "NetworkOnly",
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
