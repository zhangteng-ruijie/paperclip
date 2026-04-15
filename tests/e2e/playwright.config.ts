import { defineConfig } from "@playwright/test";

// Use port 3100 to reuse the already-running dev server.
// Set PAPERCLIP_E2E_PORT to a different port to start a dedicated test server.
const PORT = Number(process.env.PAPERCLIP_E2E_PORT ?? 3100);
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: ".",
  testMatch: "**/*.spec.ts",
  timeout: 60_000,
  retries: 0,
  use: {
    baseURL: BASE_URL,
    headless: true,
    screenshot: "only-on-failure",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
  // When PAPERCLIP_E2E_PORT is set, start a dedicated test server.
  // Otherwise, reuse the already-running dev server on that port.
  webServer: process.env.PAPERCLIP_E2E_PORT
    ? {
        command: `pnpm paperclipai run`,
        url: `${BASE_URL}/api/health`,
        reuseExistingServer: false,
        timeout: 120_000,
        stdout: "pipe",
        stderr: "pipe",
        env: {
          ...process.env,
          PORT: String(PORT),
          PAPERCLIP_DEPLOYMENT_MODE: "local_trusted",
        },
      }
    : undefined,
  outputDir: "./test-results",
  reporter: [["list"], ["html", { open: "never", outputFolder: "./playwright-report" }]],
});
