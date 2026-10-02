import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/browser",
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:5174",
    viewport: { width: 1440, height: 1000 },
    trace: "retain-on-failure",
  },
  webServer: {
    command: "pnpm dev",
    url: "http://127.0.0.1:5174/api/health",
    timeout: 60000,
    reuseExistingServer: false,
    env: {
      OMZETIN_API_PORT: "8788",
      OMZETIN_WEB_PORT: "5174",
      OMZETIN_ORIGIN: "http://127.0.0.1:5174",
      OMZETIN_DATA_DIR: "memory",
    },
  },
  reporter: "list",
});
