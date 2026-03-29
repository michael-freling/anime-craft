import { test, expect } from "@playwright/test";

test("complete session flow: select mode, pick reference, draw, submit, view feedback", async ({
  page,
}) => {
  // 1. Go to home page
  await page.goto("/");
  await expect(page.locator("h1")).toHaveText("Anime Craft");

  // 2. Select exercise mode - "Line Work" (data-testid="mode-line_work")
  await page.getByTestId("mode-line_work").click();

  // 3. Wait for reference images to load and select the first one
  // The reference cards have data-testid="reference-card-{id}" and class "reference-card"
  await page.locator(".reference-card").first().waitFor();
  await page.locator(".reference-card").first().click();

  // 4. Start Session button should be enabled now
  const startBtn = page.getByTestId("start-session-btn");
  await expect(startBtn).toBeEnabled();
  await startBtn.click();

  // 5. Verify we navigated to the session page
  await expect(page).toHaveURL(/\/session\/.+/);

  // 6. Wait for the session to load (reference image or canvas should appear)
  await page.getByTestId("drawing-canvas").waitFor();

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

  // 8. Submit drawing (data-testid="submit-btn")
  await page.getByTestId("submit-btn").click();

  // 9. Verify we're on feedback page
  await expect(page).toHaveURL(/\/session\/.+\/feedback/, { timeout: 10000 });

  // 10. Verify feedback content is displayed
  await expect(page.locator("h1")).toHaveText("Drawing Feedback");
  // Wait for feedback to load (the summary text from mock data)
  await expect(page.getByTestId("feedback-summary")).toBeVisible({
    timeout: 10000,
  });
  await expect(page.getByTestId("overall-score")).toBeVisible();

  // 11. Verify the overall score contains a number (72 from mock)
  const scoreEl = page.getByTestId("overall-score");
  await expect(scoreEl).toContainText("72");

  // 12. Verify category breakdown is present
  await expect(page.getByTestId("category-breakdown")).toBeVisible();

  // 13. Verify strengths and improvements are shown
  await expect(page.getByTestId("feedback-strengths")).toBeVisible();
  await expect(page.getByTestId("feedback-improvements")).toBeVisible();

  // 14. Click Start New Session to go back home
  await page.getByTestId("new-session-btn").click();
  await expect(page).toHaveURL("/");
});

test("discard session returns to home", async ({ page }) => {
  await page.goto("/");

  // Select mode and reference
  await page.getByTestId("mode-line_work").click();
  await page.locator(".reference-card").first().waitFor();
  await page.locator(".reference-card").first().click();
  await page.getByTestId("start-session-btn").click();

  // Wait for session page
  await expect(page).toHaveURL(/\/session\/.+/);
  await page.getByTestId("drawing-canvas").waitFor();

  // Discard the session (data-testid="discard-btn")
  await page.getByTestId("discard-btn").click();

  // Should be back at home
  await expect(page).toHaveURL("/");
});

test("start session button is disabled until mode and reference are selected", async ({
  page,
}) => {
  await page.goto("/");

  const startBtn = page.getByTestId("start-session-btn");
  await expect(startBtn).toBeDisabled();

  // Select mode only - still disabled (no reference selected yet)
  await page.getByTestId("mode-coloring").click();
  await expect(startBtn).toBeDisabled();

  // Wait for references to load, then select one - now enabled
  await page.locator(".reference-card").first().waitFor();
  await page.locator(".reference-card").first().click();
  await expect(startBtn).toBeEnabled();
});
