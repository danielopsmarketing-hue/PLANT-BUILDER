// Core canvas engine: equipment placement, connector routing, junctions,
// and undo/redo -- the load-bearing primitives everything else in the
// Builder (styling, AI drafts, the command layer) is built on top of.
const { test, expect } = require("@playwright/test");
const { loginAsAdmin } = require("./support/auth.js");

test.beforeEach(async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto("/index.html");
  await page.waitForSelector(".catalog-item", { timeout: 10000 });
});

test("placing equipment and connecting it produces a routed path", async ({ page }) => {
  const { nodeCount, connectorCount, hasPath } = await page.evaluate(() => {
    const app = window.plantBuilder;
    const a = app.addNode(app.equipment[0].id, 100, 100);
    const b = app.addNode(app.equipment[1].id, 500, 400);
    app.addConnector(a, b);
    return {
      nodeCount: app.nodes.size,
      connectorCount: app.connectors.size,
      hasPath: !!document.querySelector(".connector-line:not(.free-line)")?.getAttribute("d"),
    };
  });
  expect(nodeCount).toBe(2);
  expect(connectorCount).toBe(1);
  expect(hasPath).toBe(true);
});

test("undo/redo round-trips a connector add", async ({ page }) => {
  await page.evaluate(() => {
    const app = window.plantBuilder;
    const a = app.addNode(app.equipment[0].id, 100, 100);
    const b = app.addNode(app.equipment[1].id, 500, 400);
    app.addConnector(a, b);
  });
  await page.evaluate(() => window.plantBuilder.undo());
  await expect.poll(() => page.evaluate(() => window.plantBuilder.connectors.size)).toBe(0);

  await page.evaluate(() => window.plantBuilder.redo());
  await expect.poll(() => page.evaluate(() => window.plantBuilder.connectors.size)).toBe(1);
});

test("a junction merges two connectors without a crossing-bridge arc between them", async ({ page }) => {
  const result = await page.evaluate(() => {
    const app = window.plantBuilder;
    const a = app.addNode(app.equipment[0].id, 100, 100);
    const b = app.addNode(app.equipment[1].id, 100, 400);
    const c = app.addNode(app.equipment[2].id, 500, 250);
    const j = app.addJunction(300, 250);
    app.addConnector(a, j);
    app.addConnector(b, j);
    app.addConnector(j, c);

    const pathsById = new Map();
    for (const [id, conn] of app.connectors) {
      const from = app.getBox(conn.from);
      const to = app.getBox(conn.to);
      pathsById.set(id, app.getConnectorPoints(conn, from, to));
    }
    const bridges = app.computeCrossingBridges(pathsById);
    let bridgeCount = 0;
    for (const arr of bridges.values()) bridgeCount += arr.length;
    return { connectorCount: app.connectors.size, junctionCount: app.junctions.size, bridgeCount };
  });
  expect(result.connectorCount).toBe(3);
  expect(result.junctionCount).toBe(1);
  expect(result.bridgeCount).toBe(0);
});

test("deleting a junction removes its attached connectors, and undo restores both", async ({ page }) => {
  await page.evaluate(() => {
    const app = window.plantBuilder;
    const a = app.addNode(app.equipment[0].id, 100, 100);
    const b = app.addNode(app.equipment[1].id, 500, 400);
    const j = app.addJunction(300, 250);
    app.addConnector(a, j);
    app.addConnector(j, b);
    app.selectOne("junction", j);
    app.deleteSelection();
  });
  await expect.poll(() => page.evaluate(() => window.plantBuilder.junctions.size)).toBe(0);
  await expect.poll(() => page.evaluate(() => window.plantBuilder.connectors.size)).toBe(0);

  await page.evaluate(() => window.plantBuilder.undo());
  await expect.poll(() => page.evaluate(() => window.plantBuilder.junctions.size)).toBe(1);
  await expect.poll(() => page.evaluate(() => window.plantBuilder.connectors.size)).toBe(2);
});

test("no uncaught page errors during core canvas interaction", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.evaluate(() => {
    const app = window.plantBuilder;
    const a = app.addNode(app.equipment[0].id, 100, 100);
    const b = app.addNode(app.equipment[1].id, 500, 400);
    app.addConnector(a, b);
    app.undo();
    app.redo();
  });
  expect(errors).toEqual([]);
});
