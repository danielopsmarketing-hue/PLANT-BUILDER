// Shared helpers so every spec file doesn't hand-roll its own login/
// invite flow -- mirrors the webServer env vars in playwright.config.js.
const ADMIN_EMAIL = "admin@test.local";
const ADMIN_PASSWORD = "test-admin-password-123";

async function loginAsAdmin(page) {
  await page.goto("/login.html");
  await page.fill("#field-email", ADMIN_EMAIL);
  await page.fill("#field-password", ADMIN_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/index\.html|admin\.html|users\.html|plants\.html/, { timeout: 5000 });
}

// Invites a fresh user (unique email per call via a counter) with the
// given role, accepts the invitation in a brand-new browser context (so
// it doesn't disturb the caller's own session), and returns that
// context/page already logged in as the new user plus their credentials.
// Caller is responsible for closing the returned context.
let inviteCounter = 0;

async function inviteAndLogin(adminPage, browser, { role = "staff", firstName = "Test", lastName = "User" } = {}) {
  inviteCounter += 1;
  const email = `invitee${inviteCounter}-${Date.now()}@test.local`;
  const password = "invitee-password-123";

  await adminPage.goto("/users.html");
  await adminPage.waitForSelector(".admin-table", { timeout: 5000 });
  await adminPage.click("#btn-invite-user");
  await adminPage.waitForSelector("#invite-modal-backdrop:not(.hidden)");
  await adminPage.fill("#field-first-name", firstName);
  await adminPage.fill("#field-last-name", lastName);
  await adminPage.fill("#field-email", email);
  await adminPage.selectOption("#field-role", role);
  await adminPage.click('#invite-form button[type="submit"]');
  await adminPage.waitForSelector("#invite-link-panel:not(.hidden)", { timeout: 5000 });
  const inviteLink = await adminPage.inputValue("#invite-link-value");
  const token = new URL(inviteLink).searchParams.get("token");

  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`/set-password.html?token=${token}`);
  await page.waitForSelector("#set-password-form:not(.hidden)", { timeout: 5000 });
  await page.fill("#field-password", password);
  await page.fill("#field-password-confirm", password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/index\.html/, { timeout: 5000 });

  return { context, page, email, password };
}

module.exports = { ADMIN_EMAIL, ADMIN_PASSWORD, loginAsAdmin, inviteAndLogin };
