import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/dev",
  use: { baseURL: "http://127.0.0.1:4181/interview-cards/" },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 4181 --strictPort",
    url: "http://127.0.0.1:4181/interview-cards/",
  },
});
