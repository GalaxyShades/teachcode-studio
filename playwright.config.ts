import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  use: { baseURL: "http://127.0.0.1:3100", trace: "retain-on-failure" },
  webServer: {
    command: "node scripts/e2e-server.mjs",
    url: "http://127.0.0.1:3100/login",
    reuseExistingServer: false,
    timeout: 120000,
  },
  timeout: 60000,
});
