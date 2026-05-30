import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    proxy: {
      // All requests to /cf-api/* get forwarded to codeforces.com/api/*
      // This bypasses CORS entirely — the proxy runs server-side
      "/cf-api": {
        target: "https://codeforces.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/cf-api/, "/api"),
      },
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("recharts")) return "recharts";
          if (id.includes("framer-motion")) return "framer-motion";
          if (id.includes("dagre")) return "dagre";
          // Exclude react-dom from vendor: it would otherwise get pulled in by
          // transitive deps, creating a react-dom <-> vendor circular chunk warning.
          if (id.includes("react-dom")) return;
          return "vendor";
        },
      },
    },
  },
});
