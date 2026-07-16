import { defineConfig, type PluginOption } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/supabase/vite";
import fs from "fs";

// Plugin: emit /version.json with a unique build ID on every build so the
// client can poll it and surface an "Update available" banner whenever a new
// version ships (even without a Service Worker change).
function buildVersionPlugin(): PluginOption {
  const buildId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  // Set FORCE_LOGOUT_ON_DEPLOY=true in the build env to make every active
  // client log out and clear cookies/storage when this build ships.
  const forceLogout =
    String(process.env.FORCE_LOGOUT_ON_DEPLOY || "").toLowerCase() === "true";
  const payload = JSON.stringify({
    buildId,
    builtAt: new Date().toISOString(),
    forceLogout,
  });
  return {
    name: "build-version",
    transformIndexHtml() {
      return [
        {
          tag: "meta",
          attrs: { name: "app-build-id", content: buildId },
          injectTo: "head" as const,
        },
      ];
    },
    generateBundle(this: any) {
      this.emitFile({
        type: "asset",
        fileName: "version.json",
        source: payload,
      });
    },
    configureServer(server: any) {
      // Serve /version.json in dev too
      server.middlewares.use("/version.json", (_req: any, res: any) => {
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Cache-Control", "no-store");
        res.end(payload);
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          ui: ['@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu', '@radix-ui/react-tabs', '@radix-ui/react-select'],
          charts: ['recharts'],
          utils: ['date-fns', 'clsx', 'tailwind-merge'],
        },
      },
    },
    chunkSizeWarningLimit: 1000,
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    buildVersionPlugin(),
    mcpPlugin(),
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
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5 MB limit
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api/, /^\/sw\.js$/],
        runtimeCaching: [
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
            // CRITICAL: never cache ANY auth endpoint — caching 401s here is
            // what was logging users out spuriously when their network was flaky.
            urlPattern: /^https:\/\/.*\.supabase\.co\/auth\/.*/i,
            handler: "NetworkOnly",
          },
          {
            // Only cache REST/storage GETs, never auth.
            urlPattern: /^https:\/\/.*\.supabase\.co\/(rest|storage)\/.*/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "supabase-cache-v3",
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60,
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
