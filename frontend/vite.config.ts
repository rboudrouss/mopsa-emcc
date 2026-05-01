import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import tailwindcss from "@tailwindcss/vite";

const isProd = process.env.NODE_ENV === "production";
const enablePWA = process.env.VITE_PWA === "true" || isProd;

export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("monaco-editor")) return "monaco";
          if (id.includes("node_modules")) return "vendor";
          if (id.includes("share.json")) return "share";
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  plugins: [
    enablePWA &&
      VitePWA({
        registerType: "autoUpdate",
        workbox: {
          maximumFileSizeToCacheInBytes: 500000000,
        },
        includeAssets: [
          "web-app-manifest-192x192.png",
          "web-app-manifest-512x512.png",
          "screenshot-desktop.png",
          "screenshot-other.png",
        ],
        manifest: {
          name: "MopsaJs",
          short_name: "MopsaJs",
          theme_color: "#ffffff",
          background_color: "#ffffff",
          display: "standalone",
          description: "Modular Open Platform for Static Analysis.",
          icons: [
            {
              src: "/web-app-manifest-192x192.png",
              sizes: "192x192",
              type: "image/png",
            },
            {
              src: "/web-app-manifest-512x512.png",
              sizes: "512x512",
              type: "image/png",
            },
          ],
          screenshots: [
            {
              src: "/screenshot-desktop.png",
              sizes: "1662x1003",
              type: "image/png",
              form_factor: "wide",
            },
            {
              src: "/screenshot-other.png",
              sizes: "650x863",
              type: "image/png",
            },
          ],
        },
      }),
    react(),
    tailwindcss(),
  ],
});
