import { test, expect } from "@playwright/test";

test("navigate between pages using sidebar links", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("h1")).toHaveText("Anime Craft", { timeout: 15000 });

  // Navigate to Progress
  await page.getByTestId("nav-progress").click();
  await expect(page).toHaveURL("/progress");
  await expect(page.locator("h1")).toHaveText("Progress");

  // Navigate to Settings
  await page.getByTestId("nav-settings").click();
  await expect(page).toHaveURL("/settings");
  await expect(page.locator("h1")).toHaveText("Settings");

  // Navigate back to Home
  await page.getByTestId("nav-home").click();
  await expect(page).toHaveURL("/");
  await expect(page.locator("h1")).toHaveText("Anime Craft");
});
