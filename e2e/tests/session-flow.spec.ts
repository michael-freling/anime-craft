import { test, expect } from "@playwright/test";

test("complete session flow: pick reference, draw, submit, view feedback", async ({
  page,
}) => {
  // 1. Go to home page and wait for it to load
  await page.goto("/");
  await expect(page.locator("h1")).toHaveText("Anime Craft", { timeout: 15000 });

  // 2. Wait for reference images to load from the real database (seeded by migrations).
  //    The reference cards use the class "reference-card" but the "add image" card also
  //    has that class with an additional "reference-card-add". Exclude the add card.
  const referenceCards = page.locator(".reference-card:not(.reference-card-add)");
  await expect(referenceCards.first()).toBeVisible({ timeout: 15000 });

  // 3. Select the first reference image
  await referenceCards.first().click();

  // 4. Start Session button should now be enabled
  const startBtn = page.getByTestId("start-session-btn");
  await expect(startBtn).toBeEnabled();
  await startBtn.click();

  // 5. Verify we navigated to the session page
  await expect(page).toHaveURL(/\/session\/.+/);

  // 6. Wait for the drawing canvas to appear
  await page.getByTestId("drawing-canvas").waitFor({ timeout: 15000 });

  // 7. Draw something on the canvas
  const canvas = page.getByTestId("drawing-canvas");
  const box = await canvas.boundingBox();
  if (box) {
    await page.mouse.move(box.x + 50, box.y + 50);
    await page.mouse.down();
    await page.mouse.move(box.x + 150, box.y + 150);
    await page.mouse.move(box.x + 250, box.y + 100);
    await page.mouse.up();
  }

  // 8. Submit drawing
  await page.getByTestId("submit-btn").click();

  // 9. Verify we land on the feedback page
  await expect(page).toHaveURL(/\/session\/.+\/feedback/, { timeout: 30000 });

  // 10. Verify feedback content loaded (h1, summary, and score are visible)
  await expect(page.locator("h1")).toHaveText("Drawing Feedback", {
    timeout: 15000,
  });
  await expect(page.getByTestId("feedback-summary")).toBeVisible({
    timeout: 15000,
  });
  await expect(page.getByTestId("overall-score")).toBeVisible();

  // 11. The mock AI client returns overallScore 72; verify the score is a number
  const scoreText = await page.getByTestId("overall-score").textContent();
  expect(scoreText).toBeTruthy();
  expect(scoreText).toMatch(/\d+/);

  // 12. Verify category breakdown, strengths, and improvements are displayed
  await expect(page.getByTestId("category-breakdown")).toBeVisible();
  await expect(page.getByTestId("feedback-strengths")).toBeVisible();
  await expect(page.getByTestId("feedback-improvements")).toBeVisible();

  // 13. Click Start New Session to return home
  await page.getByTestId("new-session-btn").click();
  await expect(page).toHaveURL("/");
});

test("discard session returns to home", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("h1")).toHaveText("Anime Craft", { timeout: 15000 });

  // Wait for reference images to load and select the first one
  const referenceCards = page.locator(".reference-card:not(.reference-card-add)");
  await expect(referenceCards.first()).toBeVisible({ timeout: 15000 });
  await referenceCards.first().click();

  // Start the session
  await page.getByTestId("start-session-btn").click();
  await expect(page).toHaveURL(/\/session\/.+/);
  await page.getByTestId("drawing-canvas").waitFor({ timeout: 15000 });

  // Discard the session
  await page.getByTestId("discard-btn").click();

  // Should be back at home
  await expect(page).toHaveURL("/");
});

test("start session button is disabled until a reference is selected", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("h1")).toHaveText("Anime Craft", { timeout: 15000 });

  // The start button should be disabled before any reference is selected
  const startBtn = page.getByTestId("start-session-btn");
  await expect(startBtn).toBeDisabled();

  // Wait for references to load, then select one
  const referenceCards = page.locator(".reference-card:not(.reference-card-add)");
  await expect(referenceCards.first()).toBeVisible({ timeout: 15000 });
  await referenceCards.first().click();

  // Now the button should be enabled
  await expect(startBtn).toBeEnabled();
});
