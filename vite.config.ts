import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";

// Tương đương rewrites() trong next.config.ts:
// request /backend/* được proxy ngầm sang backend Docker ở port 8000.
export default defineConfig({
  plugins: [vue(), tailwindcss()],
  server: {
    port: 3000,
    proxy: {
      "/backend": {
        target: "https://automated-part-assembly-911218714377.asia-southeast1.run.app",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/backend/, ""),
        timeout: 120000,
      },
    },
  },
  preview: {
    port: 3000,
  },
});
