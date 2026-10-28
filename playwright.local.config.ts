import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests", testMatch: "local-preview.spec.ts", workers: 1,
  use: { baseURL: "http://127.0.0.1:5186/interview-cards/", trace: "retain-on-failure" },
  projects: [
    { name: "preview-chrome", use: { ...devices["Pixel 7"] } },
    { name: "preview-safari", use: { ...devices["iPhone 15"] } },
  ],
  webServer: { command: "node --import tsx tests/preview-server.ts", url: "http://127.0.0.1:5186/interview-cards/", timeout: 30000 },
});
