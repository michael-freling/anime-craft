import { defineConfig } from "@playwright/test";

// NOTE: The Wails dev server (`wails3 dev`) launches a native webview window,
// which requires a display. In headless CI environments you will need a virtual
// framebuffer (e.g. Xvfb) or run on a machine with a display.
//
// Example CI setup:
//   xvfb-run wails3 dev -config ./build/config.yml -port 9245
//
// Alternatively, developers can start the server manually (`task dev`) and
// rely on `reuseExistingServer: true` below.

export default defineConfig({
  testDir: "./tests",
  timeout: 60000,
  retries: 1,
  use: {
    baseURL: "http://localhost:9245",
    headless: true,
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "wails3 dev -config ./build/config.yml -port 9245",
    cwd: "..",
    port: 9245,
    timeout: 120000,
    reuseExistingServer: true,
  },
});
