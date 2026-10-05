// Auth/accounts (Phase 2b/2c): login, the invite -> set-password flow,
// role changes, and deactivation blocking a subsequent login.
const { test, expect } = require("@playwright/test");
const { loginAsAdmin, inviteAndLogin, ADMIN_EMAIL, ADMIN_PASSWORD } = require("./support/auth.js");

test("logging in with valid credentials reaches the Builder", async ({ page }) => {
  await page.goto("/login.html");
  await page.fill("#field-email", ADMIN_EMAIL);
  await page.fill("#field-password", ADMIN_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/index\.html|admin\.html|users\.html|plants\.html/, { timeout: 5000 });
  expect(page.url()).toContain("index.html");
});

test("logging in with a wrong password is rejected and stays on the login page", async ({ page }) => {
  await page.goto("/login.html");
  await page.fill("#field-email", ADMIN_EMAIL);
  await page.fill("#field-password", "not-the-right-password");
  await page.click('button[type="submit"]');
  await page.waitForTimeout(300);
  expect(page.url()).toContain("login.html");
});

test("an invited user can set a password and lands signed in as themself", async ({ page, browser }) => {
  await loginAsAdmin(page);
  const invitee = await inviteAndLogin(page, browser, { role: "staff", firstName: "Ivy", lastName: "Invitee" });
  try {
    const me = await invitee.page.evaluate(() => fetch("/api/auth/me", { credentials: "same-origin" }).then((r) => r.json()));
    expect(me).toMatchObject({ email: invitee.email, role: "staff", firstName: "Ivy" });
  } finally {
    await invitee.context.close();
  }
});

test("an admin can change a user's role and it takes effect immediately", async ({ page, browser }) => {
  await loginAsAdmin(page);
  const invitee = await inviteAndLogin(page, browser, { role: "staff" });
  try {
    await page.goto("/users.html");
    await page.waitForSelector(".admin-table");
    const row = page.locator("tr", { has: page.locator(`text=${invitee.email}`) });
    await row.locator("select.role-select").selectOption("manager");
    await expect.poll(async () => {
      const me = await invitee.page.evaluate(() => fetch("/api/auth/me", { credentials: "same-origin" }).then((r) => r.json()));
      return me.role;
    }).toBe("manager");
  } finally {
    await invitee.context.close();
  }
});

test("deactivating a user blocks their next login", async ({ page, browser }) => {
  await loginAsAdmin(page);
  const invitee = await inviteAndLogin(page, browser, { role: "staff" });
  await invitee.context.close();

  const usersBefore = await page.evaluate(() => fetch("/api/users", { credentials: "same-origin" }).then((r) => r.json()));
  const target = usersBefore.find((u) => u.email === invitee.email);
  const patched = await page.evaluate(
    ({ id }) => fetch(`/api/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ status: "inactive" }),
    }).then((r) => r.json()),
    { id: target.id }
  );
  expect(patched.status).toBe("inactive");

  const freshContext = await browser.newContext();
  const freshPage = await freshContext.newPage();
  await freshPage.goto("/login.html");
  await freshPage.fill("#field-email", invitee.email);
  await freshPage.fill("#field-password", invitee.password);
  await freshPage.click('button[type="submit"]');
  await freshPage.waitForTimeout(300);
  expect(freshPage.url()).toContain("login.html");
  await freshContext.close();
});

test("non-admins get a 403 calling the admin-only users API directly", async ({ page, browser }) => {
  await loginAsAdmin(page);
  const invitee = await inviteAndLogin(page, browser, { role: "staff" });
  try {
    const status = await invitee.page.evaluate(() => fetch("/api/users", { credentials: "same-origin" }).then((r) => r.status));
    expect(status).toBe(403);
  } finally {
    await invitee.context.close();
  }
});
