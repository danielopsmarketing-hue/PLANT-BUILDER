// Admin-surface gating (Phase 6a/6b): admin.html/users.html are
// admin-only, plants.html is admin+manager, and the underlying write APIs
// enforce the same roles even if someone bypasses the UI entirely.
const { test, expect } = require("@playwright/test");
const { loginAsAdmin, inviteAndLogin } = require("./support/auth.js");

test("admin.html, users.html, and plants.html are reachable for an admin", async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto("/admin.html");
  await expect(page.locator(".admin-table")).toBeVisible();
  await expect(page.locator("text=Access denied")).toHaveCount(0);

  await page.goto("/users.html");
  await expect(page.locator(".admin-table")).toBeVisible();

  await page.goto("/plants.html");
  await expect(page.locator(".admin-table")).toBeVisible();
});

test("a staff user is denied the Equipment Library and Users pages in the UI", async ({ page, browser }) => {
  await loginAsAdmin(page);
  const invitee = await inviteAndLogin(page, browser, { role: "staff" });
  try {
    await invitee.page.goto("/admin.html");
    await expect(invitee.page.locator("text=Access denied")).toBeVisible();

    await invitee.page.goto("/users.html");
    await expect(invitee.page.locator("text=Access denied")).toBeVisible();

    await invitee.page.goto("/plants.html");
    await expect(invitee.page.locator("text=Access denied")).toBeVisible();
  } finally {
    await invitee.context.close();
  }
});

test("a manager can see All Plants but is denied the Equipment Library", async ({ page, browser }) => {
  await loginAsAdmin(page);
  const invitee = await inviteAndLogin(page, browser, { role: "manager" });
  try {
    await invitee.page.goto("/plants.html");
    await expect(invitee.page.locator("text=Access denied")).toHaveCount(0);
    await expect(invitee.page.locator(".admin-table")).toBeVisible();

    await invitee.page.goto("/admin.html");
    await expect(invitee.page.locator("text=Access denied")).toBeVisible();
  } finally {
    await invitee.context.close();
  }
});

test("a staff session gets 403s calling admin-only write APIs directly, bypassing the UI", async ({ page, browser }) => {
  await loginAsAdmin(page);
  const invitee = await inviteAndLogin(page, browser, { role: "staff" });
  try {
    const statuses = await invitee.page.evaluate(async () => {
      const results = {};
      results.postEquipment = await fetch("/api/equipment", {
        method: "POST",
        credentials: "same-origin",
        body: new FormData(),
      }).then((r) => r.status);
      results.getUsers = await fetch("/api/users", { credentials: "same-origin" }).then((r) => r.status);
      results.getPlantsAll = await fetch("/api/plants-all", { credentials: "same-origin" }).then((r) => r.status);
      return results;
    });
    expect(statuses.postEquipment).toBe(403);
    expect(statuses.getUsers).toBe(403);
    expect(statuses.getPlantsAll).toBe(403);
  } finally {
    await invitee.context.close();
  }
});

test("All Plants lists every user's saved layouts, not just the viewer's own", async ({ page, browser }) => {
  await loginAsAdmin(page);
  await page.goto("/index.html");
  await page.waitForSelector(".catalog-item", { timeout: 10000 });
  const plantName = `Cross-user visibility check ${Date.now()}`;
  await page.evaluate(async (name) => {
    const app = window.plantBuilder;
    app.addNode(app.equipment[0].id, 100, 100);
    const { saveLayout } = await import("/js/storage.js");
    await saveLayout(name, {
      id: null,
      nodes: Array.from(app.nodes.values()),
      connectors: [],
      shapes: [],
      lines: [],
      junctions: [],
    });
  }, plantName);

  const invitee = await inviteAndLogin(page, browser, { role: "manager" });
  try {
    await invitee.page.goto("/plants.html");
    await expect(invitee.page.locator(`text=${plantName}`)).toBeVisible();
  } finally {
    await invitee.context.close();
  }
});
