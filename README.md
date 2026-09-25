# OPS Group Plant Builder

A drag-and-drop visual tool for sales reps: drag crushing/screening
equipment onto a canvas, arrange it into a flow (hopper → crusher → screen
→ conveyors → stockpile), connect it with directional arrows, and export
the result as a branded PNG for a customer quote or proposal.

**This is a sales/presentation tool, not an engineering tool.** There is no
throughput math, no tonnage calculation, and no compatibility validation
between equipment. If a layout looks right and reads clearly, it's correct.
Keep it that way — see "Constraints" below.

## Current state

The equipment catalog has a real backend on SQLite: a small Express API
backs a central catalog with an admin UI for managing listings (including
image uploads), and the sales-facing builder reads from it live. A real
per-user account system (users, roles, sessions, invitations) also exists
now, tested end-to-end — but nothing in the app's UI uses it yet; see
"Accounts & authentication" for exactly what that means. Saved *layouts*
(what a rep draws) are still browser `localStorage` only — that's the next
piece of real persistence to build; see "What needs to be built next".

### Running it

```
cd server
npm install
npm start
```

Then open `http://localhost:4000` — the server serves the frontend
(`public/`) and the API from one process. A nav pill in the top bar
("Builder" / "Equipment Library") switches between the two pages.

On first run the server creates `server/data/plantbuilder.db` (SQLite) and
seeds it with the real 77-product catalog (from `server/seed-data.js`).
Edit or delete records from the admin UI — nothing in the seed is
permanent. See "Database" below for how this is structured and how an
existing JSON-file deployment upgrades.

### Protecting the admin page

The Equipment Library page and every catalog-editing request (add/edit/
delete, image upload) require a logged-in **admin** account — real
per-user accounts (see "Accounts & authentication" below), not the old
shared-password HTTP Basic Auth this replaced as of Phase 6a. A manager
or staff account gets a 403 from the write routes even if they know the
URL; the page itself shows "Access denied" for anyone logged in who
isn't an admin, and redirects to `/login.html` for anyone not logged in
at all — same pattern as the Builder.

The builder itself (`index.html`) requires login too (any role), and the
read-only catalog API (`GET /api/equipment`, `/api/categories`) stays
public either way, so a saved layout's equipment icons still resolve
without a session.

### What it does

**Builder (`index.html`)**

- Custom drag-and-drop (not native HTML5 DnD): dragging a catalog item or
  a Tools item spawns a floating preview that follows the cursor exactly,
  with the canvas highlighting as a drop target. Dropping outside the
  canvas cancels cleanly. This replaced an earlier native-DnD
  implementation that was the source of a real bug — the browser's own
  drag gesture didn't track reliably once the cursor left the source
  element.
- Equipment renders free-standing on canvas and in the catalog panel —
  icon on top, name below, no card/box border by default (AggFlow's
  actual convention: an icon represents the equipment *type*, the
  name/model is a separate label, not baked into a bordered tile). Icons
  use a consistent red/gray/black/yellow illustration style (chassis and
  moving parts in red, hopper/housing in gray, tracks/belts/outlines in
  dark charcoal, safety-yellow accents) matching the reference equipment
  illustrations provided, distinct per equipment type (jaw/cone/impact
  crushers, screens, conveyors, stackers, stockpiles, washers, shredders,
  mixers). A thin category-color tick under the icon adds category
  color-coding on top of that. Selecting a node shows a dashed outline as
  affordance, not a permanent border.
- Tools panel: drag a Rectangle, Ellipse, Note, Line, or Stockpile onto
  the canvas as a freeform annotation, independent of equipment
  (drawio-style basic shapes). Each is draggable, resizable (corner
  handle), and editable — text label through the Inspector, lines get two
  draggable endpoint handles when selected. Delete like anything else on
  the canvas; all of it participates in undo/redo and the PNG export.
- Equipment catalog panel, grouped by category, searchable, collapsible
  groups, 2-column icon grid.
- Canvas nodes: place, move, resize (drag the corner handle, like drawio),
  select, delete.
- **Orthogonal connectors, auto-routed by default, editable on demand**:
  hover a node or Tools shape to reveal four arrow chevrons outside its
  edges, drag from one to another (any mix of equipment/shapes) to
  connect them. Connections render as clean Manhattan (horizontal/
  vertical-only) paths with small rounded corners — a straight run when
  the two anchor points line up, one routed bend otherwise. In "auto"
  mode the path is recomputed from live box positions on every render, so
  moving either end reroutes automatically. Select a connector and its
  interior segments (not the two ends anchored to equipment) show small
  drag grips — dragging one slides that segment, switching the connector
  to "manual" mode and remembering the shape from then on; right-click →
  **Reset Route** goes back to automatic. Right-click → **Add Waypoint**
  inserts a new bend wherever you right-clicked, including on a straight
  connector that has no bends yet. Right-click → **Add/Edit Label** (or
  double-click the line) attaches a small text label that stays centered
  on the path as it moves. **Crossing vs. junction**: two connectors that
  don't share an equipment endpoint but cross get a small arc "hop" on
  the later-drawn one, so a crossing never looks like a connection — a
  distinction the spec calls out as important for technical diagrams.
  Freeform lines (from the Tools panel) stay simple two-point lines and
  still magnet-snap to a node/shape edge; the routing/waypoint machinery
  above is connector-specific.
- **Multi-selection**: shift-click to add/remove a node, shape, connector,
  or line from the selection; drag on empty canvas to draw a selection
  rectangle (everything it touches gets selected). Dragging any selected
  item moves the whole selection together, preserving relative positions
  and every connection between them.
- **Alignment guides**: dragging a node or shape near another one's edges
  or center shows a temporary red guide line and snaps into place —
  prioritized over grid-snap when both are in range. Disappears the
  instant you let go.
- **Align / distribute**: with 2+ objects selected, the Inspector panel
  shows Align Left/Center/Right/Top/Middle/Bottom; with 3+, Distribute
  Horizontally/Vertically (equal gaps, not equal centers).
- **Right-click context menu** on a node/shape (Duplicate, Delete, Bring
  to Front, Send to Back) or a connector (Reverse Direction, Delete).
- **Keyboard shortcuts**: Delete/Backspace, Ctrl+Z / Ctrl+Shift+Z (undo/
  redo), Ctrl+D (duplicate selection, offset by one grid cell), Ctrl+A
  (select all), Ctrl+C/X/V (copy/cut/paste — pasted items get fresh IDs,
  and only the connections that were fully inside the copied selection
  come along), Arrow keys (nudge 1px), Shift+Arrow (nudge one grid unit),
  Escape (clear selection / cancel an in-progress connection).
- Snap-to-grid: dropping, moving, or resizing a node or shape snaps to the
  24px grid (matching the visible background grid). Hold Alt while
  dragging to place freely without snapping.
- Undo/redo (toolbar buttons or Ctrl+Z / Ctrl+Shift+Z), covering adds,
  deletes, moves, resizes, connections, alignment, duplication, and paste
  — a real history stack (array of full-state snapshots), not a visual
  refresh.
- Inspector panel: selected item's Make (brand), Model, Category, and
  Weight (pulled out of the spec sheet if present) as a detail table,
  followed by any other specs, position, **Check Stock** and **View
  Brochure** buttons (live links when the item has a stock/brochure URL
  set in the catalog, otherwise disabled with a tooltip explaining why),
  and a free-text notes field. Selecting 2+ objects switches this panel
  to the multi-select summary + align/distribute controls instead.
- Zoom (scroll wheel, or Ctrl+wheel/toolbar buttons), centered on the
  cursor. **Panning is Space+drag or middle-mouse-drag** — a plain
  left-drag on empty canvas draws a selection rectangle instead, so
  "move the canvas" and "select several things" are never the same
  gesture and neither one can accidentally move equipment.
- Export to a branded PNG (via html2canvas), including a simple equipment
  list alongside the flow diagram
- Save/load via browser `localStorage` — **this is not real persistence**,
  it's a stand-in that proves the save/load interaction works. Layouts do
  not sync across browsers, devices, or users.

**What's not built yet** (a real diagramming engine is a large system;
this is the foundation + connections + editing + advanced-connections
phases, not the whole thing): **explicit junction nodes** — a persisted
entity you deliberately create by dragging one connector's endpoint onto
another connector, as opposed to the automatic crossing-bridge detection
that's already in (that part only decides *how a crossing renders*, it
doesn't let you convert a crossing into a real 3-way branch point); no
persistent object grouping or locking; no minimap; and routing avoids
nothing — a connector routes between its two anchor points, it doesn't
yet detour *around* a third piece of equipment sitting in the way. All of
these are real follow-up work, not corners intentionally cut for the demo.

**Admin (`admin.html`)**

- Table of every catalog item with thumbnail, name, model, category,
  brochure status, and stock-check status
- Add/edit form: name, model, category, a placeholder icon (used as the
  fallback shape until a real image is uploaded), an image upload, an
  arbitrary list of spec rows (label + value), a brochure link, and a
  stock-check link (populates the Inspector's Check Stock/View Brochure
  buttons on the Builder side)
- Delete, with confirmation

Changes made here are what reps see the next time they load or refresh the
builder's catalog panel — this is the "one source of truth... maintained by
sales ops" piece from the original brief.

### Product images

The catalog is seeded with 77 real products (Terex Finlay, Terex EvoQuip,
Telestack, Terex Ecotec, CBI, Terex Washing Systems) from the supplied
spreadsheet, but none of them have real photos yet. Web search for
candidate photos ran fine from this environment, but actually downloading
any image did not — this sandbox's network egress policy blocks outbound
requests to general web domains (confirmed: 403 on every manufacturer/
dealer host tried, not a fluke or a bad URL). A markdown reference of the
candidate source URLs found per product was generated and sent
separately; use it to grab photos manually and upload them via the admin
page, or re-run the same search-and-download approach from an environment
with normal web access (e.g. Claude Code on your own machine).

Until real photos are in, the placeholder icons (`js/icons.js`) carry more
of the visual load than before. They're modeled on how AggFlow (an actual
aggregate-flowsheet tool) presents equipment, confirmed via its own help
docs rather than guessed: a monochrome icon represents the equipment
*type* (a generic "jaw crusher" silhouette), while the specific
make/model is a separate text label — AggFlow itself right-clicks a
placed icon to pick manufacturer/model, and to recolor it, rather than
baking a brand or category color into the icon. This app follows the
same split: `js/icons.js` icons are neutral slate, not colored per
category, and category color shows only as a small accent tick under the
icon. Crushers, screens, and the stacker render as a small mobile-plant
illustration — tracked crawler base, the crusher/screen body, an angled
discharge conveyor with a roller at the tip — matching how these machines
are actually drawn in flowsheet diagrams (crusher body shape differs per
type: jaw shows a flywheel, cone shows the tapered mantle + feed ring,
impact shows the rotor). These are still hand-drawn placeholders, not
photos — they render both in the catalog panel and on canvas nodes (same
`thumbHtml()` path), and get replaced automatically the moment a real
image is uploaded for that item.

### Project layout

```
server/
  server.js       — Express app: static hosting + REST API + uploads
  database.js     — shared SQLite connection (one DB file for the app;
                    future tables — e.g. plant projects — go here too)
  db.js           — equipment-catalog CRUD, on the shared connection
  auth.js         — users/roles/sessions/invitations, on the shared
                    connection (see "Accounts & authentication" below)
  seed-data.js    — real 77-product catalog loaded into a fresh database
  data/           — plantbuilder.db lives here (gitignored)
  uploads/        — uploaded product images (gitignored)
public/
  index.html      — the builder
  admin.html      — the catalog admin page
  css/styles.css  — builder styling (shared brand tokens)
  css/admin.css   — admin-page-only styling
  js/api.js       — fetch wrappers for the REST API
  js/app.js       — canvas, nodes, connectors, inspector, export, undo/redo
  js/admin.js     — admin page logic
  js/icons.js     — placeholder geometric icons per category (fallback
                    when a listing has no uploaded image)
  js/storage.js   — localStorage save/load for layouts
```

Real branding (OPS Group — navy/blue-gray, matching the supplied logo) is
in place in the header, toolbar, and PNG export. The actual logo *file*
itself still isn't wired in — a logo pasted directly into a chat message
doesn't arrive with a filesystem path this environment can read (a
markdown/text file attached the normal way does, which is how the project
brief came through). The brand mark is a text lockup ("OPS") as a
stand-in. To finish this: attach the logo as a **file** rather than a
pasted/inline image, or push it into the repo directly (e.g.
`public/assets/ops-group-logo.svg` or `.png`) and say so — either way it's
a five-minute wire-up once the file itself is reachable.

## Database

The equipment catalog moved from a flat JSON file to SQLite
(`server/data/plantbuilder.db`), via Node's built-in `node:sqlite` — no
native module to compile, no separate DB server to run, same
zero-dependency shape the JSON-file store had. Requires **Node ≥22.5**
(see `server/package.json`'s `engines` field); older Node will fail at
startup with a clear "Cannot find module 'node:sqlite'" error rather than
a confusing one.

**Why now, and why this way:** saved plant *layouts* (Phase 2d/2e, not
yet built) need real ownership — a `plant_projects` table with an
`ownerId` foreign key to the `users` table below. That's not a sensible
thing to bolt onto a JSON array; it needs an actual relational store.
Moving the catalog first, on its own, kept that change small and
independently testable before anything depended on it.

**One connection, one file, split for what's coming.**
`server/database.js` owns the single `DatabaseSync` connection and the
one `.db` file; each data-access file (`db.js` for equipment, `auth.js`
for users/sessions, a future `plant-projects.js`) creates its own
table(s) on that shared connection via `CREATE TABLE IF NOT EXISTS`.
`db.js` exports the exact same `list/get/create/update/remove` functions
it always had — `server.js` needed no equipment-route changes for this
migration.

**Upgrading an existing (JSON-file) deployment:** fully automatic and
non-destructive. On first run, if `equipment.db` is empty and an old
`server/data/equipment.json` is present, its exact records are imported
(preserving any real catalog edits) instead of reseeding from
`seed-data.js`; a brand-new install with neither file seeds fresh. The
old JSON file is never deleted or written to — it's only ever read once,
so it stays on disk afterward as a safety net.

**Rollback:** revert this commit (`git revert`, or check out the prior
commit) and the app is back to reading `equipment.json` directly — since
that file was never touched by the migration, no data recovery step is
needed. Deleting `plantbuilder.db` and restarting re-runs the same
migration/seed logic from scratch.

**Tested:** full create/read/update/delete through the real admin UI
(including an image upload) against a fresh SQLite database, the
JSON→SQLite migration path with real records, and the complete existing
Playwright regression suite (canvas, connectors, drag-and-drop, admin) —
all passing against the new backend with no behavior change.

## Accounts & authentication

A real per-user account system (`server/auth.js`), on the same SQLite
database as the equipment catalog — `users` and `sessions` tables, no
second database. This is the backend only: **nothing in the app's UI
uses it yet.** `admin.html` and the equipment write routes still run on
the original shared-password HTTP Basic Auth gate from before (see
"Protecting the admin page" above), untouched. Wiring real accounts into
that page, and building any login/setup screens, is UI work — deliberately
left for the phase that covers it (a Users admin page) rather than built
ahead of schedule here. Everything below is real and tested, just via
direct API calls rather than through a browser UI so far.

**Model:**
```
users:    id, firstName, lastName, email (unique), passwordHash,
          role (admin | manager | staff), status (invited | active |
          inactive), invitationTokenHash, invitationExpiresAt,
          createdAt, updatedAt, lastLoginAt
sessions: id (a hash of the session token — not the raw token, so
          reading the table doesn't hand out a working login),
          userId, createdAt, expiresAt
```
`role` and `status` are plain text validated in application code, not a
database enum — adding a role later is a one-line change, not a schema
migration.

**Passwords:** Node's built-in `crypto.scrypt` (a standard, OWASP-listed
password-hashing KDF, already in Node core) — no new dependency. Never
stored or returned in plain text; API responses never include the hash.

**Sessions:** an opaque random token in an `httpOnly`, `SameSite=Lax`
cookie (`Secure` when `NODE_ENV=production`), hashed before being stored
and looked up. 30-day expiry. A deactivated user's *existing* session
stops working on the very next request, not just at its next login —
status is re-checked on every authenticated call, not cached.

**Invitations:** `POST /api/users` (admin-only) creates an account in
`invited` status with a hashed, 7-day-expiry token, and returns a link
the admin copies and sends manually — per this phase's explicit scope,
no transactional email is wired up yet. The invitee's own
`GET/POST /api/auth/invitation/:token` calls don't require being logged
in already, for the obvious reason.

**Bootstrap admin:** since admins are normally created by admins, the
first one can't be — if the `users` table is empty on startup, the
server creates one automatically. Set `BOOTSTRAP_ADMIN_EMAIL` and
`BOOTSTRAP_ADMIN_PASSWORD` to choose the credentials; leave them unset
and the server generates a random password and prints it to the console
once, on that first run only (log in and change it via
`POST /api/auth/change-password`).

**Routes:**
```
POST   /api/auth/login                        — email + password -> session cookie
POST   /api/auth/logout                       — invalidates the session
GET    /api/auth/me                            — current user (401 if not logged in)
POST   /api/auth/change-password               — requires auth
GET    /api/auth/invitation/:token             — public; who is this invite for
POST   /api/auth/invitation/:token/accept      — public; sets password, activates, logs in
GET    /api/users                              — admin-only; list all users
POST   /api/users                              — admin-only; invite a user
PATCH  /api/users/:id                          — admin-only; change role/status
```
The last two, plus `/api/users`, reject non-admins with 403 — enforced
server-side in `requireRole`, not by hiding a button. Deactivating or
demoting the last active admin is also rejected, so the system can't
lock everyone out.

**Tested:** a 26-point API test covering the full lifecycle — bootstrap
login, wrong-password rejection, inviting a user, an invited (not yet
active) account failing to log in, accepting the invitation, logging in
with the new password, a staff account being rejected from both
admin-only endpoints, listing users with no password/token hashes ever
exposed, deactivation revoking an already-open session immediately (not
just blocking future logins), the last-admin guard, and password change
invalidating the old password — all 26 passing. The full pre-existing
Playwright regression suite (canvas, connectors, equipment admin) was
also re-run and is unaffected, since none of that code was touched.

## Plant projects & login (Phase 2d/2e)

Layouts are no longer `localStorage` — they're `plant_projects` rows in the
same SQLite database, owned by the account that created them, served
through a real login UI. This closes out the two-parallel-systems gap
called out below: the Builder (`index.html`) now requires a session the
same way `/api/plants` already did.

**Model** (`server/plants.js`):
```
plant_projects: id, name, ownerId, createdBy, updatedBy,
                 status (active | deleted), version,
                 thumbnail, data (JSON TEXT: nodes/connectors/shapes/lines),
                 createdAt, updatedAt, lastOpenedAt
```
Ownership is enforced in the data-access functions themselves (every
lookup is scoped to `ownerId = :userId`), not just in the route handler —
a staff account can't reach another user's plant by guessing an id.
Delete is soft (`status = 'deleted'`), matching the same "don't erase
ownership history" reasoning already used for deactivated users.
`listAll()` (joined with the owner's name) exists now but is only used by
the admin-only `/api/plants-all` route — the actual "All Plants" *view* is
still Phase 6b.

**Routes** (all require login; `credentials: "same-origin"` from the
client):
```
GET    /api/plants                — the logged-in user's own active plants
POST   /api/plants                — create
GET    /api/plants/:id            — owner-only
PUT    /api/plants/:id            — owner-only; bumps version
PATCH  /api/plants/:id            — owner-only; rename
DELETE /api/plants/:id            — owner-only; soft-delete
POST   /api/plants/:id/duplicate  — owner-only
GET    /api/plants-all            — admin/manager only, all users' plants
```

**Login UI:** `login.html` (email/password), `set-password.html` (token
from an invitation link → set a password → activated + logged in
straight away). Both are plain static pages, no framework, matching the
rest of the app. `js/auth-guard.js` exposes `requireLogin()` — called from
`index.html` before `app.js` even loads, so an unauthenticated visitor is
redirected to `login.html?redirect=...` and never sees the canvas. This
guard is documented in its own source as **UX convenience only** — the
real boundary is server-side session validation on every `/api/*` call,
same as before.

**Autosave:** `storage.js` moved from a synchronous localStorage shim to
an async thin client over `/api/plants` (same exported function names, so
call sites barely changed). `app.js` debounces a save 2 seconds after any
history-producing edit (`pushHistory()` → `scheduleAutosave()`), but only
once a plant has been explicitly saved at least once (`currentLayoutId`
set) — a brand-new unnamed canvas is never silently persisted. A
`#save-status` indicator in the toolbar shows "Unsaved changes" / "Saving…"
/ "Saved" / "Save failed".

**A bootstrap-order bug found and fixed during this phase:** gating
`app.js` behind an async login check meant it had to be loaded via a
dynamic `import()` *after* `await requireLogin()` resolved — by which
point `DOMContentLoaded` had already fired, so app.js's old
`document.addEventListener("DOMContentLoaded", ...)` bootstrap never ran
and the canvas silently never initialized. Fixed by checking
`document.readyState` and booting immediately if the document was already
past `loading`.

**Tested:** an 11-point Playwright end-to-end pass — unauthenticated
redirect, login, placing a shape, manual save, verifying persistence via
a direct API call, editing + waiting for the autosave debounce and
confirming the save-status indicator, reloading the page and finding the
plant still listed, loading it back with its content intact, deleting it,
and confirming it's gone from both the UI and the API. A separate
core-engine regression pass (equipment placement, connector routing,
undo, redo) confirmed nothing in the canvas engine itself regressed from
the auth-gating changes.

**Not done in this phase, deliberately:** `admin.html`'s own auth gate is
still the original shared-password Basic Auth — switching it to
`requireRole("admin")` is grouped with Phase 6a (Users admin page) below,
since that's the natural place to also expose role management in the UI
rather than just cutting the gate over with nothing to manage it yet.

## Advanced canvas / drawing system (Phase 3)

Four increments toward the technical-diagramming feature set (Stream 2 of
the phased plan), all in `public/js/app.js`:

**3a — Line/connector style system.** Connectors and freeform lines carry
a `style` object (`strokeColor`, `strokeWidth`, `lineType`: solid/dashed/
dotted, `arrowStart`/`arrowEnd`) instead of a fixed look. A contextual
"Style" panel in the Inspector edits it live — preset swatches plus a
full color picker, thickness/dash selects, arrow toggles — and extends to
multi-select: selecting several connectors/lines together edits all of
them at once. Arrowhead markers are generated per color so they match
the line rather than always being dark gray.

**3b — Rich text styling.** Shapes (rectangle/ellipse/note/stockpile)
carry a `textStyle` object (font size, bold, italic, color, alignment),
editable the same way, including multi-select common-property editing.

**3c — Angled/diagonal routing.** Each connector now has an independent
`routing.style`: `"orthogonal"` (default, unchanged Manhattan Z-bend) or
`"angled"` (a direct point-to-point line by default; manual bends are
free vertex handles that snap to the nearest 45° ray from the previous
point, Alt for unsnapped). Toggled per connector from a "Routing" select
in its Inspector panel.

**3d — Explicit junction nodes.** A new "Junction" tool drops a small
fixed-size dot that connectors can attach to as a first-class endpoint,
same as equipment/shapes — a deliberate merge/branch point (e.g. two
feeds joining before one crusher). It reuses the existing box
abstraction (`getBox`, selection, drag, align, duplicate, z-order,
rubber-band select) rather than a parallel code path. The junction-vs-
crossing distinction the spec calls for falls out of existing logic:
`computeCrossingBridges` already skips connectors sharing an endpoint
id, so connectors meeting at a junction render as a solid point while
two unrelated connectors whose paths merely cross still get the small
arc-hop.

**Known limitation carried from 3c:** crossing-bridge arcs are only
detected between axis-aligned (orthogonal) segments today — a diagonal
angled segment crossing another connector won't get a bridge arc yet.
Not a correctness issue, just a cosmetic gap for a follow-up pass.

**Tested:** each sub-phase has its own Playwright pass (12/12, 13/13,
11/11, 13/13 respectively) plus the full accumulated regression suite
(core canvas engine, Phase 2e save/load/autosave) re-run green after
every change.

## AI plant input (Phase 5)

Natural-language plant description → real catalog equipment → a preview
on the canvas the user explicitly confirms or cancels, per Stream 1's
"never invent equipment" and "preview before committing" requirements.

**5a — search_equipment + flow-stage metadata.** `GET
/api/equipment/search?q=&category=&limit=` (auth required) is the one
lookup tool any equipment-identifying code — the stub today, a real
model later — is allowed to use; it can only return real catalog rows.
Each category in `server/seed-data.js` also carries a `flowStage`
number, a hint for default left-to-right sequencing.

**5b — plant-specification schema + translator.** `public/js/ai-plan.js`
turns a structured spec (`{ equipment: [{ref, equipmentId}], connections:
[{from, to}], notes: [{text, near}] }`) into Command Layer batches —
auto-laid-out in flow-stage columns, placed beside whatever's already on
the canvas. Every `equipmentId` is checked against the live catalog a
second time here, independent of search_equipment.

**5c — the input panel.** The "AI Assistant" toolbar button opens a
prompt → "Generate Draft" → live canvas preview → explicit Confirm/
Cancel flow, using the Phase 4a/4b command layer's preview/commit/discard
so a confirmed draft is exactly one undo step and a cancelled one leaves
the canvas untouched.

**5d — wiring a real LLM provider — intentionally not done.** `server/ai.js`
today is a stub: it splits the prompt into phrases on commas/"then"/
"into"/etc. and calls `db.search` (the same lookup a real model would
call) for each, so the whole pipeline above is real and tested, but
there's no actual language model behind it — clearly labeled as such in
the UI ("Draft mode" badge) and in code. This was an explicit standing
constraint from early in this project (agreed default: stub AI responses
until a provider decision is made) and still holds — no API key or
provider has been chosen, so no outbound call to one has been wired up.
`planFromPrompt(prompt)` is the one function a real integration would
replace; everything upstream (the panel) and downstream (the translator,
the command layer) is already built against that exact interface, so the
swap is scoped to that one file. Needs a decision below before it can move.

**Tested:** search_equipment (14-point API test), the spec translator
(22-point Playwright pass — valid/invalid/duplicate refs, flow-stage
column layout, note placement, preview/discard/commit as one step), and
the full panel (20-point Playwright pass — generate/preview/confirm/
cancel, undo of a confirmed draft, a no-match prompt correctly disabling
Confirm, regenerating replacing rather than stacking a draft) — plus the
full accumulated regression suite from every earlier phase, re-run green
after each of 5a/5b/5c.

## Staff management (Phase 6a)

**The admin.html/equipment Basic Auth gate is gone.** `admin.html` and
the equipment write routes now run on the real per-user account system
(Phase 2b) — `requireAuth` + `requireRole("admin")`, same as
`/api/users`. `ADMIN_USERNAME`/`ADMIN_PASSWORD` are no longer read
anywhere; the one enforcement mechanism for the whole app is real
accounts, not two systems running in parallel. See "Protecting the admin
page" above.

**New `/users.html`** (admin-only, same client-side `requireLogin()` +
server-side `requireRole("admin")` pattern as `admin.html`): lists every
account, lets an admin invite a new one (the invite response now returns
the actual `/set-password.html?token=...` link the invitee visits, fixed
from an earlier bug where it returned the raw API path instead), and
change a user's role or active/inactive status inline. An admin's own
row has its role select and deactivate button disabled client-side (the
server's last-active-admin check is the real guard; this just avoids the
confusing UX of locking yourself out mid-session). Deactivating
immediately blocks further login attempts — already true since Phase
2b's session-revocation design, now reachable from a UI instead of only
a direct API call.

**A second instance of the Phase 2e bootstrap-order bug** turned up
building this: `admin.js` and `users.js` both booted on
`DOMContentLoaded`, which — now that both pages gate loading them behind
an async `requireLogin()`/role check — has usually already fired by the
time the listener registers. Same fix as app.js: check
`document.readyState` and boot immediately if the document isn't still
`loading`.

**Tested:** a 24-point Playwright pass covering the admin.html/users.html
login+role gate (redirect when logged out, Access Denied for a non-admin,
full access for an admin), inviting a user, following the real
invitation link end-to-end in a separate browser context to set a
password and land in the Builder logged in, changing role, deactivating
(with the self-protection disabled state verified), a deactivated
account being rejected on its next login attempt, and server-side 403s
on direct API calls from a non-admin session — plus a 5-point pass
confirming equipment add/edit/delete still work through the new session-
based gate, and the full accumulated regression suite from every earlier
phase still green.

## Deploying (Railway)

Two things the host needs to support, because the catalog store (now
SQLite) and uploaded images are still files on disk, not a managed
database service: a long-running Node process (not pure serverless), and
a **persistent volume** — some hosts wipe local disk on every redeploy,
which would silently erase the catalog.

1. Push this branch (or merge it to whatever branch you deploy from).
2. On [railway.app](https://railway.app), New Project → Deploy from GitHub
   repo → pick this repo/branch.
3. In the service's Settings, set **Root Directory** to `server` (that's
   where `package.json` lives). Railway auto-detects the Node build/start
   commands (`npm install` / `npm start`) from there.
4. Add a **Volume** (Settings → Volumes) and mount it so it covers
   `data/` and `uploads/` relative to `server.js` — check the deploy logs
   or Railway's shell to confirm the exact absolute path in the running
   container before finalizing the mount path, since it depends on how
   Railway lays out the root-directory build.
5. In **Variables**, optionally set `BOOTSTRAP_ADMIN_EMAIL` and
   `BOOTSTRAP_ADMIN_PASSWORD` to choose the first admin account's
   credentials (see "Accounts & authentication" below) — leave them
   unset and the server generates one and prints it to the deploy logs
   on first boot. Railway sets `PORT` automatically — the app already
   reads `process.env.PORT`, no change needed.
6. Deploy. Railway gives you a `*.up.railway.app` URL — the builder is at
   `/`, the catalog admin at `/admin.html`.

## What needs to be built next

This project is now being worked as a set of phased, task-tracked
workstreams (AI plant input, advanced canvas/drawing, staff backend) — see
the session's task list for the current sequence and status. The
near-term backend pieces:

1. **Switching `admin.html` over to real accounts** (Phase 6a) — the
   Builder now requires real login (see "Plant projects & login" above);
   the equipment admin page is the one remaining surface still on the
   original shared-password Basic Auth.
2. **Users admin page** (Phase 6a) and **All Plants management view**
   (Phase 6b) — the backend for both (`/api/users`, `/api/plants-all`)
   already exists and is tested; no UI consumes them yet.

## Constraints that should not change without a conversation

- No engineering/throughput calculations. Visual layout only.
- Equipment catalog is centrally managed, not per-rep. (Now enforced by
  the backend — there's no per-rep catalog editing path in the builder.)
- Export needs to stay presentation-quality — this is a sales leave-behind,
  not a technical drawing.

## Open decisions (need your input before or during the next phase)

- Real logo file — see note above.
- Real equipment lineup is now in (77 products from the spreadsheet), but
  specs, product photos, brochure links, and stock-check links are still
  empty — the admin UI is ready for all of these, someone needs to fill
  them in (see "Product images" above for photos specifically).
- ~~Whether reps can see each other's customer layouts, or only their
  own~~ — implemented as owner-only by default (`/api/plants`), with
  admin/manager able to see everyone's via `/api/plants-all` (Phase 2d);
  the "All Plants" view that actually exposes that to a manager in the UI
  is still Phase 6b. Flag if owner-only isn't the right default.
- ~~Hosting preference~~ — Railway, see "Deploying" above.
- **Which LLM provider for the real AI plant-input feature (Phase 5d)** —
  Anthropic, OpenAI, or another provider, plus confirmation that
  supplying/storing an API key (as a Railway environment variable, same
  as `BOOTSTRAP_ADMIN_PASSWORD`) is okay. Nothing calls
  out to any provider today (see "AI plant input" above) — this is the
  one thing blocking that from moving past its current stub.

Answering the rest unblocks the remaining backend/auth work.
