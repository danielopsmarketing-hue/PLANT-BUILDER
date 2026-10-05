// Plant Project persistence (Phase 2d/2e): save/load against the real
// /api/plants backend (not localStorage), autosave, and ownership
// isolation between two different users.
const { test, expect } = require("@playwright/test");
const { loginAsAdmin, inviteAndLogin } = require("./support/auth.js");

test.beforeEach(async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto("/index.html");
  await page.waitForSelector(".catalog-item", { timeout: 10000 });
});

test("saving a layout by name persists it via the Plant Project API", async ({ page }) => {
  await page.evaluate(() => {
    const app = window.plantBuilder;
    app.addNode(app.equipment[0].id, 100, 100);
  });
  await page.click("#btn-save");
  await page.fill("#modal-input", "Smoke test layout");
  await page.click("#modal-confirm");

  await expect.poll(() => page.evaluate(() => window.plantBuilder.currentLayoutId)).not.toBeNull();
  const saveStatus = await page.textContent("#save-status");
  expect(saveStatus).toBe("Saved");

  const id = await page.evaluate(() => window.plantBuilder.currentLayoutId);
  const stored = await page.evaluate(
    (plantId) => fetch(`/api/plants/${plantId}`, { credentials: "same-origin" }).then((r) => r.json()),
    id
  );
  expect(stored.name).toBe("Smoke test layout");
  expect(stored.data.nodes).toHaveLength(1);
});

test("loading a saved layout restores its nodes and connectors", async ({ page }) => {
  const layoutId = await page.evaluate(async () => {
    const app = window.plantBuilder;
    const a = app.addNode(app.equipment[0].id, 100, 100);
    const b = app.addNode(app.equipment[1].id, 400, 100);
    app.addConnector(a, b);
    const { saveLayout } = await import("/js/storage.js");
    return saveLayout("Load-me layout", {
      id: null,
      nodes: Array.from(app.nodes.values()),
      connectors: Array.from(app.connectors.values()),
      shapes: [],
      lines: [],
      junctions: [],
    });
  });

  await page.reload();
  await page.waitForSelector(".catalog-item", { timeout: 10000 });
  await expect.poll(() => page.evaluate(() => window.plantBuilder.els.loadSelect.options.length)).toBeGreaterThan(1);

  await page.selectOption("#load-select", layoutId);
  await page.click("#btn-load");

  await expect.poll(() => page.evaluate(() => window.plantBuilder.nodes.size)).toBe(2);
  await expect.poll(() => page.evaluate(() => window.plantBuilder.connectors.size)).toBe(1);
});

test("autosave pushes updates to an already-saved layout without a new Save click", async ({ page }) => {
  await page.evaluate(() => {
    const app = window.plantBuilder;
    app.addNode(app.equipment[0].id, 100, 100);
  });
  await page.click("#btn-save");
  await page.fill("#modal-input", "Autosave target");
  await page.click("#modal-confirm");
  await expect.poll(() => page.evaluate(() => window.plantBuilder.currentLayoutId)).not.toBeNull();
  const id = await page.evaluate(() => window.plantBuilder.currentLayoutId);

  await page.evaluate(async () => {
    const app = window.plantBuilder;
    app.addNode(app.equipment[1].id, 400, 100);
    await app.autosaveNow();
  });

  const stored = await page.evaluate(
    (plantId) => fetch(`/api/plants/${plantId}`, { credentials: "same-origin" }).then((r) => r.json()),
    id
  );
  expect(stored.data.nodes).toHaveLength(2);
});

test("two different users' saved layouts are isolated from each other", async ({ page, browser }) => {
  const ownLayoutId = await page.evaluate(async () => {
    const app = window.plantBuilder;
    app.addNode(app.equipment[0].id, 100, 100);
    const { saveLayout } = await import("/js/storage.js");
    return saveLayout("Admin-only layout", {
      id: null,
      nodes: Array.from(app.nodes.values()),
      connectors: [],
      shapes: [],
      lines: [],
      junctions: [],
    });
  });

  const invitee = await inviteAndLogin(page, browser, { role: "staff" });
  try {
    const list = await invitee.page.evaluate(() => fetch("/api/plants", { credentials: "same-origin" }).then((r) => r.json()));
    expect(list.find((p) => p.id === ownLayoutId)).toBeUndefined();

    const directFetch = await invitee.page.evaluate(
      (plantId) => fetch(`/api/plants/${plantId}`, { credentials: "same-origin" }).then((r) => r.status),
      ownLayoutId
    );
    expect(directFetch).toBe(404);
  } finally {
    await invitee.context.close();
  }
});
