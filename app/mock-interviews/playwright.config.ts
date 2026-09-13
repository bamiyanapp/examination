import { defineConfig, devices } from "@playwright/test";
import { buildPlaywrightConfig } from "./e2e/playwright.config.base.js"; // symlink

export default buildPlaywrightConfig({
  defineConfig,
  devices,
  reportName: "examination(mock-interviews) E2E Report",
});
