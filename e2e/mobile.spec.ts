import { expect, test } from "@playwright/test";

test("keeps the creation workflow and bottom navigation usable on phone viewports", async ({ page }) => {
  await page.goto("/create-image");
  await expect(page.getByRole("heading", { name: "Create an image" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Mobile navigation" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeHidden();
  const action = page.getByRole("button", { name: "Generate image" });
  await action.scrollIntoViewIfNeeded();
  await expect(action).toBeInViewport();
  await expect(page.getByRole("navigation", { name: "Mobile navigation" })).toBeVisible();
  await page.screenshot({ path: "test-results/mobile-create-image.png", fullPage: true });
});