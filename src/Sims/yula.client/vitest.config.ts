import path from "node:path";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

// UI (component) testleri — gerçek Chromium'da koşar:
//   npm run test:ui
// Saf logic testleri node:test + tsx ile devam eder (npm run test).
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  esbuild: {
    jsx: "automatic",
  },
  test: {
    include: ["src/**/*.test.tsx"],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      screenshotDirectory: "vitest-test-results",
      instances: [{ browser: "chromium" }],
    },
  },
});
