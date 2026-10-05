// Command layer (Phase 4a/4b): structured mutations, batching, and the
// preview/commit/discard flow the AI panel is built on.
const { test, expect } = require("@playwright/test");
const { loginAsAdmin } = require("./support/auth.js");

test.beforeEach(async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto("/index.html");
  await page.waitForSelector(".catalog-item", { timeout: 10000 });
});

test("a multi-command batch collapses into exactly one undo step", async ({ page }) => {
  const historyIndexBefore = await page.evaluate(() => window.plantBuilder.historyIndex);
  await page.evaluate(() => {
    const app = window.plantBuilder;
    const eq = app.equipment[2].id;
    app.applyCommandBatch([
      { type: "addNode", equipmentId: eq, x: 100, y: 100 },
      { type: "addNode", equipmentId: eq, x: 300, y: 100 },
      { type: "addNode", equipmentId: eq, x: 500, y: 100 },
      { type: "addJunction", x: 700, y: 100 },
      { type: "addShape", kind: "note", x: 900, y: 100 },
    ]);
  });
  const historyIndexAfter = await page.evaluate(() => window.plantBuilder.historyIndex);
  expect(historyIndexAfter).toBe(historyIndexBefore + 1);

  const counts = await page.evaluate(() => ({
    nodes: window.plantBuilder.nodes.size,
    junctions: window.plantBuilder.junctions.size,
    shapes: window.plantBuilder.shapes.size,
  }));
  expect(counts).toEqual({ nodes: 3, junctions: 1, shapes: 1 });

  await page.evaluate(() => window.plantBuilder.undo());
  await expect.poll(() => page.evaluate(() => window.plantBuilder.nodes.size)).toBe(0);
});

test("preview applies mutations live without touching history; discard rolls back exactly", async ({ page }) => {
  const historyIndexBefore = await page.evaluate(() => window.plantBuilder.historyIndex);
  await page.evaluate(() => {
    window.plantBuilder.applyCommandBatch(
      [{ type: "addNode", equipmentId: window.plantBuilder.equipment[0].id, x: 200, y: 200 }],
      { preview: true }
    );
  });
  const duringPreview = await page.evaluate(() => ({
    nodeCount: window.plantBuilder.nodes.size,
    historyIndex: window.plantBuilder.historyIndex,
    pending: window.plantBuilder.hasPendingBatch(),
  }));
  expect(duringPreview).toEqual({ nodeCount: 1, historyIndex: historyIndexBefore, pending: true });

  await page.evaluate(() => window.plantBuilder.discardPendingBatch());
  const afterDiscard = await page.evaluate(() => ({
    nodeCount: window.plantBuilder.nodes.size,
    pending: window.plantBuilder.hasPendingBatch(),
  }));
  expect(afterDiscard).toEqual({ nodeCount: 0, pending: false });
});

test("committing a preview folds it into exactly one undo step", async ({ page }) => {
  const historyIndexBefore = await page.evaluate(() => window.plantBuilder.historyIndex);
  await page.evaluate(() => {
    const app = window.plantBuilder;
    app.applyCommandBatch(
      [
        { type: "addNode", equipmentId: app.equipment[0].id, x: 200, y: 200 },
        { type: "addNode", equipmentId: app.equipment[1].id, x: 400, y: 200 },
      ],
      { preview: true }
    );
    app.commitPendingBatch();
  });
  const after = await page.evaluate(() => ({
    nodeCount: window.plantBuilder.nodes.size,
    historyIndex: window.plantBuilder.historyIndex,
    pending: window.plantBuilder.hasPendingBatch(),
  }));
  expect(after).toEqual({ nodeCount: 2, historyIndex: historyIndexBefore + 1, pending: false });
});
