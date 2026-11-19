import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
  server: {
    // In dev the page runs on Vite (5173); send API calls to Express.
    proxy: {
      "/crawl": "http://localhost:8080",
      "/healthz": "http://localhost:8080",
    },
  },
});
