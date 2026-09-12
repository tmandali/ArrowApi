import { defineConfig, devices } from "@playwright/test";

// Yula web portu (package.json: dev / start).
const PORT = process.env.PORT ?? "56402";
const baseURL = `http://localhost:${PORT}`;

/**
 * E2E iskeleti — bkz. tests/e2e/*.e2e.ts
 *
 * Yerelde:  npm run test:e2e   (dev server otomatik kalkar)
 * CI'da:    önce `npm run build`, ardından `npm run test:e2e` (start ile).
 */
export default defineConfig({
  testDir: "./tests",
  testMatch: "*.e2e.ts",
  timeout: 30 * 1000,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? "github" : "list",

  expect: {
    timeout: 15 * 1000,
  },

  webServer: {
    command: process.env.CI ? "npm run start" : "npm run dev:next",
    url: baseURL,
    timeout: 120 * 1000,
    reuseExistingServer: !process.env.CI,
    env: {
      PORT,
    },
  },

  use: {
    baseURL,
    trace: process.env.CI ? "on" : "retain-on-failure",
    video: process.env.CI ? "retain-on-failure" : undefined,
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    ...(process.env.CI
      ? [
          {
            name: "firefox",
            use: { ...devices["Desktop Firefox"] },
          },
        ]
      : []),
  ],
});
