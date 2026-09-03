import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  // Serial browser workers avoid contention between software-rendered 3D views.
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 8_000 },
  use: { baseURL: "http://localhost:3100", trace: { mode: "retain-on-failure", screenshots: false } },
  webServer: { command: "npm run build && PORT=3100 npm run start", url: "http://localhost:3100", reuseExistingServer: false, timeout: 180_000 },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] } },
    { name: "desktop-firefox", use: { ...devices["Desktop Firefox"] } },
  ],
});
