import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // All requests to /cf-api/* get forwarded to codeforces.com/api/*
      // This bypasses CORS entirely — the proxy runs server-side
      "/cf-api": {
        target: "https://codeforces.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/cf-api/, "/api"),
      },
    },
  },
});
