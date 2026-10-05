// Line/connector style system (Phase 3a), text styling (3b), and angled
// routing with 45-degree snap (3c).
const { test, expect } = require("@playwright/test");
const { loginAsAdmin } = require("./support/auth.js");

test.beforeEach(async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto("/index.html");
  await page.waitForSelector(".catalog-item", { timeout: 10000 });
});

test("connector style panel edits color, width, dash, and arrows", async ({ page }) => {
  await page.evaluate(() => {
    const app = window.plantBuilder;
    const a = app.addNode(app.equipment[0].id, 100, 100);
    const b = app.addNode(app.equipment[1].id, 500, 400);
    app.addConnector(a, b);
  });
  await expect(page.locator("#style-width")).toBeVisible();

  await page.click('.style-swatch[data-color="#dc2626"]');
  await page.selectOption("#style-width", "thick");
  await page.selectOption("#style-dash", "dashed");
  await page.check("#style-arrow-start");

  await expect.poll(() => page.evaluate(() => Array.from(window.plantBuilder.connectors.values())[0].style)).toMatchObject({
    strokeColor: "#dc2626",
    strokeWidth: 4,
    lineType: "dashed",
    arrowStart: true,
  });
});

test("a style change is a single undoable step that doesn't disturb earlier edits", async ({ page }) => {
  await page.evaluate(() => {
    const app = window.plantBuilder;
    const a = app.addNode(app.equipment[0].id, 100, 100);
    const b = app.addNode(app.equipment[1].id, 500, 400);
    app.addConnector(a, b);
  });
  await page.click('.style-swatch[data-color="#dc2626"]');
  await page.check("#style-arrow-start");
  await page.waitForTimeout(100);

  await page.evaluate(() => window.plantBuilder.undo());
  await expect.poll(() => page.evaluate(() => Array.from(window.plantBuilder.connectors.values())[0].style.arrowStart)).toBe(false);
  const colorAfterOneUndo = await page.evaluate(() => Array.from(window.plantBuilder.connectors.values())[0].style.strokeColor);
  expect(colorAfterOneUndo).toBe("#dc2626");
});

test("note text style (color, bold) applies and persists", async ({ page }) => {
  const noteId = await page.evaluate(() => window.plantBuilder.addShape("note", 300, 300));
  await page.evaluate((id) => window.plantBuilder.selectOne("shape", id), noteId);
  await page.fill("#inspector-notes", "150 tph target");
  await page.click('.style-swatch[data-textcolor="#059669"]');
  await page.click("#textstyle-bold");

  await expect.poll(() => page.evaluate((id) => window.plantBuilder.shapes.get(id).textStyle, noteId)).toMatchObject({
    color: "#059669",
    bold: true,
  });
});

test("angled routing switches a connector to a direct path with 45-degree snapped waypoints", async ({ page }) => {
  await page.evaluate(() => {
    const app = window.plantBuilder;
    const a = app.addNode(app.equipment[0].id, 100, 100);
    const b = app.addNode(app.equipment[1].id, 600, 500);
    app.addConnector(a, b);
  });
  const orthogonalPointCount = await page.evaluate(() => {
    const app = window.plantBuilder;
    const conn = Array.from(app.connectors.values())[0];
    return app.getConnectorPoints(conn, app.getBox(conn.from), app.getBox(conn.to)).length;
  });
  expect(orthogonalPointCount).toBeGreaterThan(2); // a diagonal pair Z-bends under orthogonal routing

  await page.selectOption("#routing-style", "angled");
  const angledPointCount = await page.evaluate(() => {
    const app = window.plantBuilder;
    const conn = Array.from(app.connectors.values())[0];
    return app.getConnectorPoints(conn, app.getBox(conn.from), app.getBox(conn.to)).length;
  });
  expect(angledPointCount).toBe(2); // a direct line needs no bend

  const waypointAngleIsSnapped = await page.evaluate(() => {
    const app = window.plantBuilder;
    const conn = Array.from(app.connectors.values())[0];
    const from = app.getBox(conn.from);
    const to = app.getBox(conn.to);
    app.addWaypointAt(conn, from, to, { x: 300, y: 130 }); // deliberately off any clean 45-degree ray
    const [p0, p1] = conn.routing.points;
    const angleDeg = (Math.atan2(p1.y - p0.y, p1.x - p0.x) * 180) / Math.PI;
    const normalized = ((angleDeg % 45) + 45) % 45;
    return normalized < 1 || normalized > 44;
  });
  expect(waypointAngleIsSnapped).toBe(true);
});
