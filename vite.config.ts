import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": "http://localhost:8888",
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    env: {
      PGLITE_MEMORY: "1",
      SESSION_SECRET: "secret-de-test",
    },
    testTimeout: 30000,
    fileParallelism: false,
  },
});
