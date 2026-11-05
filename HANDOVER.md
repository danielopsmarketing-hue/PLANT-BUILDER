# Handover: OPS Group Plant Builder

Written for whichever agent (or person) picks this project up next. Read
this first — it's the orientation layer. `README.md` is the deep
reference (architecture, every phase's design rationale, full deploy
steps) and this doc points into it rather than repeating it.

## TL;DR

A drag-and-drop sales tool: reps lay out crushing/screening equipment on
a canvas, connect it into a flow, and export a branded PNG for a quote.
Node/Express + SQLite backend, vanilla-JS canvas frontend, real
session-cookie auth with roles (admin/manager/staff), a committed
Playwright test suite (33 tests, all green as of this handover), and CI.
Feature-complete for all three originally-planned streams (AI plant
input, advanced canvas, staff backend) — see "What's actually left"
below for the real remaining gaps.

## Where everything lives

- **Repo:** https://github.com/danielopsmarketing-hue/PLANT-BUILDER
  (public).
- **Branch:** `claude/md-file-project-setup-sicdjx` — this is also the
  repo's **default branch**. There is no `main`/`master`; don't create
  one unless you're deliberately restructuring. All work so far has been
  committed straight to this one branch, no PRs.
- **Structure:** `server/` is the whole backend (Express app, SQLite data
  access, the committed test suite) and is also the npm package root —
  `cd server` before any `npm` command. `public/` is the static
  frontend Express serves directly (no build step, no bundler, plain
  ES modules loaded by the browser).

## Get it running

```
cd server
npm install
npm start
```

Open `http://localhost:4000`. First run creates `server/data/plantbuilder.db`
(SQLite, via Node's built-in `node:sqlite` — **requires Node ≥ 22.5**,
see `server/package.json`'s `engines`) and seeds the real 77-product
catalog. It prints a generated admin password to the console on first
boot unless you set `BOOTSTRAP_ADMIN_EMAIL`/`BOOTSTRAP_ADMIN_PASSWORD`.

## What's been built

Everything — see README's "Current state" for the full list. In one line
per stream:
- **Canvas**: orthogonal/angled routing with 45° snap, line/text styling,
  explicit junctions, a structured command layer with batched/previewable
  undo.
- **AI plant input**: prompt → stub keyword-matching planner (never
  invents equipment, only picks real catalog items) → live preview on
  canvas → explicit confirm/cancel. **Not a real LLM yet** — see "Open
  decisions" below, this is the one deliberately-unfinished piece.
- **Backend**: real accounts/roles/invites, owned+autosaved plant
  projects (not `localStorage`), an admin equipment-catalog UI, a
  Users page, and a read-only All-Plants view for admins/managers.

## Test suite

```
cd server
npm test
```

Runs 33 Playwright tests (`server/tests/*.spec.js`) against a real,
isolated instance of the server (own temp SQLite DB, own temp uploads
dir, bootstrap admin account) — not mocks. Covers the canvas engine,
styling/routing, the command layer's batch/preview/commit/discard
semantics, accounts/auth, plant persistence + cross-user ownership
isolation, the AI planner's catalog-only guarantee, and admin-page role
gating. CI runs the same `npm test` on every push
(`.github/workflows/test.yml`).

**One gotcha if you ever touch the test harness:** don't move the
`tests/.tmp-data`/`.tmp-uploads` cleanup into a Playwright `globalSetup`.
It raced with `webServer` startup in an earlier version — the server
would win, bootstrap its admin account, then have its data directory
deleted out from under its already-open SQLite handle, and every write
after that failed with `attempt to write a readonly database` (SQLite
couldn't create a journal file in a now-missing directory). The fix was
moving cleanup into an npm `pretest` script, which runs to completion as
its own process before `playwright test` is even invoked. Leave it there.

Just before this handover: ran `npm audit fix` to clear 3 known
high/moderate DoS advisories in transitive deps (`body-parser`, `multer`,
`qs`) — only `package-lock.json` changed, full suite re-verified green
afterward.

## Deploying

README's "Deploying (Railway)" section has the full walkthrough
(persistent volume for `server/data`/`server/uploads`, env vars, root
directory setting). Nothing about this has changed since it was written.

## What's actually left

Not "next phases" — those are all done. The real remaining work is in
README's "Open decisions" and "What needs to be built next" sections:
- **The LLM provider decision** — `server/ai.js` is a deliberate stub
  (phrase-splitting + best-match lookup against the real catalog, never
  a real language model) pending a provider/API-key choice. This is the
  one open architectural question that needs a human decision, not
  something to pick on your own.
- A real product logo, and specs/photos/brochure links for most of the
  77 catalog items (the admin UI supports all of this; the data just
  isn't filled in).
- Minor polish: crossing-bridge arcs only detect axis-aligned crossings,
  not diagonal ones; copy/paste doesn't cover junctions/freeform lines.

## Things that do NOT carry over from this session

- A daily recurring review task (cron job, "Daily review #1" in an
  earlier commit) was scheduled from this session via Claude Code's own
  cron tool. Those jobs are **session-scoped** — they don't persist to
  disk and die when the session ends, and even if the session were still
  alive, recurring jobs auto-expire after 7 days. It is gone. If you want
  ongoing automated review, it needs to be re-scheduled from whatever
  session picks this up (`/loop` or the cron tool), it's not configured
  anywhere in the repo itself.
- A standalone, backend-free build of the canvas (equipment catalog and
  AI planner embedded as static JS, localStorage instead of the real
  API) was published as a Claude Artifact for quick browser testing:
  https://claude.ai/artifact/VbPU97dcKyq7bQXq9sA18X. Its source lives
  only in that published artifact, **not in this repo** — it was built
  in a scratchpad directory that doesn't persist between sessions. If a
  no-backend demo build is still wanted going forward, it should
  probably be rebuilt and committed properly (e.g. under something like
  `demo/`) rather than left as a one-off artifact.

## GitHub access for whoever picks this up

The repo is **public**, so read access (cloning, browsing) needs nothing
from you. The gap is **write** access: pushing commits requires the next
agent's own Claude Code session to have its GitHub connection authorized
for this repo, the same way this session's access was set up originally
(via the account's GitHub connection / the Claude GitHub App). That's a
step you (the account owner) take when starting the next session, not
something transferable by leaving a token or credential in this repo —
and nothing in this project requires any secret to run locally (no API
keys, no `.env` file — confirmed clean, nothing secret-looking is
committed).

## Everything else

A full `.zip` of this repo (working tree + git history, `node_modules`
excluded since `npm install` regenerates it from the committed
lockfile) was provided alongside this doc as a self-contained fallback,
in case the next environment can't `git clone` directly.
