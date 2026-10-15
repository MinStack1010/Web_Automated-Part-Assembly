import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";

// Equivalent of rewrites() in next.config.ts:
// requests to /backend/* are transparently proxied to the Docker backend on port 8000.
export default defineConfig({
  plugins: [vue(), tailwindcss()],
  server: {
    port: 3000,
    proxy: {
      "/backend": {
        target: "http://localhost:8000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/backend/, ""),
        timeout: 120000,
      },
      "/health": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 3000,
  },
});
