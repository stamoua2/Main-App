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
    setupFiles: ["./tests/setup.ts"],
    env: {
      PGLITE_MEMORY: "1",
      SESSION_SECRET: "secret-de-test",
      SEED_ALEX_PASSWORD: "MotDePasseAlex123!",
      SQUARE_ACCESS_TOKEN: "jeton-de-test",
      SQUARE_WEBHOOK_SIGNATURE_KEY: "cle-webhook-de-test",
      SQUARE_WEBHOOK_NOTIFICATION_URL: "https://mainappsav.netlify.app/api/webhooks/square",
      GOOGLE_MAPS_API_KEY: "cle-maps-de-test",
      GEMINI_API_KEY: "cle-gemini-de-test",
    },
    testTimeout: 30000,
    fileParallelism: false,
  },
});
