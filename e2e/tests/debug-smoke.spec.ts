import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const OUTPUT_DIR = "/tmp/anime-craft-e2e";

test("debug smoke: capture feedback page state", async ({ page }) => {
  // Ensure output directory exists
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Collect console messages
  const consoleLogs: string[] = [];
  page.on("console", (msg) => {
    consoleLogs.push(`[${msg.type()}] ${msg.text()}`);
  });
  page.on("pageerror", (err) => {
    consoleLogs.push(`[pageerror] ${err.message}`);
  });

  // Navigate to home
  await page.goto("/");
  await expect(page.locator("h1")).toHaveText("Anime Craft", { timeout: 15000 });

  // Select first reference and start session
  const referenceCards = page.locator(".reference-card:not(.reference-card-add)");
  await expect(referenceCards.first()).toBeVisible({ timeout: 15000 });
  await referenceCards.first().click();
  await page.getByTestId("start-session-btn").click();

  // Draw something
  await page.getByTestId("drawing-canvas").waitFor({ timeout: 15000 });
  const canvas = page.getByTestId("drawing-canvas");
  const box = await canvas.boundingBox();
  if (box) {
    await page.mouse.move(box.x + 50, box.y + 50);
    await page.mouse.down();
    await page.mouse.move(box.x + 150, box.y + 150);
    await page.mouse.up();
  }

  // Submit and wait for feedback page
  await page.getByTestId("submit-btn").click();
  await expect(page).toHaveURL(/\/session\/.+\/feedback/, { timeout: 30000 });
  await expect(page.locator("h1")).toHaveText("Drawing Feedback", { timeout: 15000 });

  // Wait for loading to finish (either scores or analyzing message appears)
  await page.waitForSelector('[data-testid="feedback-scores"]', { timeout: 15000 });

  // Take screenshot
  await page.screenshot({ path: path.join(OUTPUT_DIR, "feedback-page.png"), fullPage: true });

  // Write console logs
  fs.writeFileSync(
    path.join(OUTPUT_DIR, "console.log"),
    consoleLogs.join("\n") + "\n"
  );

  // Copy backend debug.log if it exists
  const xdgDataHome = process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share");
  const debugLogPath = path.join(xdgDataHome, "anime-craft", "debug.log");
  if (fs.existsSync(debugLogPath)) {
    fs.copyFileSync(debugLogPath, path.join(OUTPUT_DIR, "backend-debug.log"));
  }

  // Log what we found (soft assertions — capture state, don't just fail)
  const hasScores = await page.getByTestId("score-bar-overall").isVisible().catch(() => false);
  const hasSummary = await page.getByTestId("feedback-summary").isVisible().catch(() => false);
  const isAnalyzing = await page.getByTestId("feedback-scores-analyzing").isVisible().catch(() => false);

  consoleLogs.push(`\n--- Diagnostic Summary ---`);
  consoleLogs.push(`hasScores: ${hasScores}`);
  consoleLogs.push(`hasSummary: ${hasSummary}`);
  consoleLogs.push(`isAnalyzing: ${isAnalyzing}`);

  // Write updated console logs with summary
  fs.writeFileSync(
    path.join(OUTPUT_DIR, "console.log"),
    consoleLogs.join("\n") + "\n"
  );

  // Hard assertion: scores should be visible (not "Analyzing...")
  expect(hasScores).toBe(true);
  expect(hasSummary).toBe(true);
});
