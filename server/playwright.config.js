// Real, committed test suite -- replaces the ad-hoc scratchpad scripts
// this project was built and verified with throughout its development,
// which never made it into the repo and so weren't runnable by anyone
// else (or in a later session). See server/tests/README.md for the
// testing strategy this follows.

const path = require("path");

const PORT = 4100; // distinct from the dev-server default (4000) so a local `npm run dev` isn't disturbed
const DATA_DIR = path.join(__dirname, "tests", ".tmp-data");
const UPLOADS_DIR = path.join(__dirname, "tests", ".tmp-uploads");

module.exports = {
  testDir: "./tests",
  timeout: 30000,
  fullyParallel: false, // tests share one server + one SQLite file; parallel workers would race on account/plant state
  workers: 1,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  // Cleanup of tests/.tmp-data|.tmp-uploads lives in package.json's
  // "pretest" script, NOT a globalSetup here -- globalSetup and webServer
  // startup aren't ordered relative to each other, and when webServer won
  // that race it would bootstrap the admin account, then have its data
  // directory deleted out from under its already-open SQLite handle,
  // which can no longer create journal files and starts failing every
  // write with "attempt to write a readonly database". A pretest script
  // runs to completion as its own process before `playwright test` is
  // even invoked, so there's nothing left to race.
  use: {
    baseURL: `http://localhost:${PORT}`,
    // This sandbox's pre-installed Chromium isn't at Playwright's usual
    // managed-browser path. PLAYWRIGHT_CHROMIUM_PATH is unset on a normal
    // dev machine or CI runner, where Playwright resolves its own
    // `npx playwright install`-managed browser instead.
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
      : {},
  },
  webServer: {
    command: "node server.js",
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 15000,
    env: {
      PORT: String(PORT),
      PLANT_BUILDER_DATA_DIR: DATA_DIR,
      PLANT_BUILDER_UPLOADS_DIR: UPLOADS_DIR,
      BOOTSTRAP_ADMIN_EMAIL: "admin@test.local",
      BOOTSTRAP_ADMIN_PASSWORD: "test-admin-password-123",
    },
  },
};
