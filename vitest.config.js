import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.test.{js,jsx}"],
    // Pin the backend flag so test runs don't depend on a developer's local
    // .env (CI has none — without this, every backend-gated section renders
    // its disabled state and 22 tests fail).
    env: { VITE_API_URL: "http://127.0.0.1:8000" },
  },
});