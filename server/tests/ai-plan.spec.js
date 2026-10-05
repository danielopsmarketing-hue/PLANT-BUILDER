// AI plant-input pipeline (Phase 5a-5c): the stub /api/ai/plan planner
// (keyword match against the real catalog, never invents equipment), the
// pure spec -> command-layer translator (ai-plan.js), and the panel's
// prompt -> preview -> confirm/cancel UI flow built on top of both.
const { test, expect } = require("@playwright/test");
const { loginAsAdmin } = require("./support/auth.js");

test.beforeEach(async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto("/index.html");
  await page.waitForSelector(".catalog-item", { timeout: 10000 });
});

test("the stub planner only ever returns real catalog ids, never invented equipment", async ({ page }) => {
  const result = await page.evaluate(() =>
    fetch("/api/ai/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ prompt: "a jaw crusher feeding a vibrating screen, then a stockpile" }),
    }).then((r) => r.json())
  );
  expect(result.stub).toBe(true);
  expect(result.spec.equipment.length).toBeGreaterThan(0);

  const catalogIds = await page.evaluate(() => window.plantBuilder.equipment.map((e) => e.id));
  for (const item of result.spec.equipment) {
    expect(catalogIds).toContain(item.equipmentId);
  }
});

test("a prompt with no catalog match reports unmatched phrases instead of guessing", async ({ page }) => {
  const result = await page.evaluate(() =>
    fetch("/api/ai/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ prompt: "xyzzy nonexistent quantum frobnicator" }),
    }).then((r) => r.json())
  );
  expect(result.spec.equipment).toHaveLength(0);
  expect(result.unmatchedPhrases.length).toBeGreaterThan(0);
});

test("the /api/ai/plan route requires authentication", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/login.html"); // an unauthenticated page to fetch a relative URL from
  const status = await page.evaluate(() =>
    fetch("/api/ai/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "a crusher" }),
    }).then((r) => r.status)
  );
  expect(status).toBe(401);
  await context.close();
});

test("planSpecToCommands never creates a node for an equipmentId outside the catalog", async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { planSpecToCommands } = await import("/js/ai-plan.js");
    const app = window.plantBuilder;
    const real = app.equipment[0];
    const spec = {
      equipment: [
        { ref: "e1", equipmentId: real.id },
        { ref: "e2", equipmentId: "not-a-real-id" },
      ],
      connections: [{ from: "e1", to: "e2" }],
    };
    const { createCommands, warnings } = planSpecToCommands(spec, {
      equipmentById: app.equipmentById,
      categories: app.categories,
    });
    return { createCommandCount: createCommands.length, warnings };
  });
  expect(result.createCommandCount).toBe(1);
  expect(result.warnings.some((w) => w.includes("not-a-real-id"))).toBe(true);
});

test("the AI panel: generating a draft previews it, and Cancel discards the preview entirely", async ({ page }) => {
  await page.click("#btn-ai");
  await expect(page.locator("#ai-panel-backdrop")).not.toHaveClass(/hidden/);
  await page.fill("#ai-prompt", "a jaw crusher feeding a vibrating screen");
  await page.click("#ai-generate");

  await expect(page.locator("#ai-results")).not.toHaveClass(/hidden/);
  await expect.poll(() => page.evaluate(() => window.plantBuilder.nodes.size)).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(() => window.plantBuilder.hasPendingBatch())).toBe(true);

  await page.click("#ai-cancel");
  await expect.poll(() => page.evaluate(() => window.plantBuilder.nodes.size)).toBe(0);
  await expect.poll(() => page.evaluate(() => window.plantBuilder.hasPendingBatch())).toBe(false);
});

test("the AI panel: confirming a draft commits it as a single undo step", async ({ page }) => {
  const historyIndexBefore = await page.evaluate(() => window.plantBuilder.historyIndex);
  await page.click("#btn-ai");
  await page.fill("#ai-prompt", "a jaw crusher feeding a vibrating screen");
  await page.click("#ai-generate");
  await expect.poll(() => page.evaluate(() => window.plantBuilder.nodes.size)).toBeGreaterThan(0);

  await page.click("#ai-confirm");
  await expect(page.locator("#ai-panel-backdrop")).toHaveClass(/hidden/);

  const after = await page.evaluate(() => ({
    nodeCount: window.plantBuilder.nodes.size,
    historyIndex: window.plantBuilder.historyIndex,
    pending: window.plantBuilder.hasPendingBatch(),
  }));
  expect(after.nodeCount).toBeGreaterThan(0);
  expect(after.pending).toBe(false);
  expect(after.historyIndex).toBe(historyIndexBefore + 1);

  await page.evaluate(() => window.plantBuilder.undo());
  await expect.poll(() => page.evaluate(() => window.plantBuilder.nodes.size)).toBe(0);
});
