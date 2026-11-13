# Data Model & API Reference

Companion to `HANDOVER.md` (orientation) and `FEATURE-REVIEW.md`
(recommendations) — this one documents the actual shape of everything:
every database table, every JSON object the frontend and backend pass
around, and every HTTP route. Written so a fresh agent with zero prior
context on this codebase can understand the system's data without
reading every source file first — though file:line references are
included throughout so you can go straight to ground truth.

Nothing here is aspirational — every shape below is copied from the
actual code (`server/database.js`, `server/auth.js`, `server/db.js`,
`server/plants.js`, `server/server.js`, `public/js/app.js`) as of this
commit, not a design doc for something not yet built.

## 1. Database (SQLite, one file, one connection)

One file: `server/data/plantbuilder.db` (path overridable via
`PLANT_BUILDER_DATA_DIR`, used by the test suite). One shared connection
(`server/database.js`), opened via Node's built-in `node:sqlite`
(`DatabaseSync` — **requires Node ≥ 22.5**, no native module, no DB
server). Each data-access file (`auth.js`, `db.js`, `plants.js`) creates
its own table(s) on that one connection via `CREATE TABLE IF NOT EXISTS`.
`PRAGMA foreign_keys = ON` is set globally.

### `users` (server/auth.js:25-40)
| column | type | notes |
|---|---|---|
| `id` | TEXT PK | UUID |
| `firstName`, `lastName` | TEXT NOT NULL | |
| `email` | TEXT NOT NULL UNIQUE | lowercased before every write/read |
| `passwordHash` | TEXT | `"<saltHex>:<hashHex>"`, scrypt — NULL until an invitation is accepted |
| `role` | TEXT NOT NULL, default `'staff'` | one of `admin` / `manager` / `staff` |
| `status` | TEXT NOT NULL, default `'invited'` | one of `invited` / `active` / `inactive` |
| `invitationTokenHash` | TEXT | SHA-256 of the raw invite token; NULL once accepted |
| `invitationExpiresAt` | TEXT (ISO) | 7 days from invite |
| `createdAt`, `updatedAt`, `lastLoginAt` | TEXT (ISO) | |

### `sessions` (server/auth.js:43-49)
| column | type | notes |
|---|---|---|
| `id` | TEXT PK | SHA-256 hash of the raw session token (the raw token is what's in the `pb_session` cookie — the hash is what's stored, never the raw value) |
| `userId` | TEXT, `REFERENCES users(id) ON DELETE CASCADE` | |
| `createdAt`, `expiresAt` | TEXT (ISO) | 30-day TTL, re-checked on every request (not just at login — a deactivated user's existing session stops working immediately) |

### `equipment` (server/db.js:14-28) — the product catalog
| column | type | notes |
|---|---|---|
| `id` | TEXT PK | UUID |
| `name` | TEXT NOT NULL | **confusingly, this holds the specific model string** (e.g. "J-1175 Jaw Crusher") |
| `model` | TEXT NOT NULL, default `''` | **this holds the brand** (e.g. "Terex Finlay") — an artifact of the source spreadsheet's Make/Model columns, labeled correctly in the UI but not renamed in the schema |
| `category` | TEXT NOT NULL | one of the 8 hard-coded category ids below — **not a foreign key**, categories aren't a table (see §2) |
| `icon` | TEXT NOT NULL, default `'generic'` | one of 12 hard-coded icon keys matched to hand-drawn SVGs in `public/js/icons.js` |
| `specs` | TEXT NOT NULL, default `'{}'` | JSON-encoded free-form `{label: value}` map, e.g. `{"Power": "125 hp"}` |
| `imagePath` | TEXT (nullable) | `/uploads/<uuid>.<ext>` or NULL |
| `brochureUrl`, `stockUrl` | TEXT (nullable) | external links |
| `createdAt`, `updatedAt` | TEXT (ISO) | **no `createdBy`/`updatedBy`** — unlike `plant_projects` below, equipment edits aren't attributed to a user (noted as a gap in `FEATURE-REVIEW.md`) |

### `plant_projects` (server/plants.js:10-25) — a rep's saved layout
| column | type | notes |
|---|---|---|
| `id` | TEXT PK | UUID |
| `name` | TEXT NOT NULL | |
| `ownerId` | TEXT, `REFERENCES users(id)` | **the** access-control field — `getForUser`/`update`/`remove` all check `row.ownerId === userId` and 403/404 otherwise |
| `createdBy`, `updatedBy` | TEXT, `REFERENCES users(id)` | |
| `status` | TEXT NOT NULL, default `'active'` | `'active'` or `'deleted'` — delete is **soft** (unlike equipment's hard delete) |
| `version` | TEXT NOT NULL, default `1` | increments on every update; **not currently read anywhere** — a version-history UI would just need to start querying this |
| `thumbnail` | TEXT (nullable) | unused currently — column exists, nothing writes to it yet |
| `data` | TEXT NOT NULL, default `'{}'` | JSON-encoded canvas state — see §3 for its internal shape |
| `createdAt`, `updatedAt`, `lastOpenedAt` | TEXT (ISO) | `lastOpenedAt` is bumped by `getForUser` (i.e. every time the owner opens it) |

**What's deliberately *not* a table:** equipment **categories** — they're
a plain JS array in `server/seed-data.js`, served read-only via
`GET /api/categories`. This is the single biggest limitation on
"building new products" outside the current 8 categories — see
`FEATURE-REVIEW.md` §2.

## 2. Core JSON shapes

### Category (`server/seed-data.js`, served as-is by `GET /api/categories`)
```jsonc
{ "id": "crushing", "label": "Crushing", "flowStage": 1 }
```
8 fixed categories: `feeding` (stage 0), `crushing` (1), `shredding`
(1), `conveying` (1.5), `screening` (2), `washing` (2), `mixing` (2),
`stockpiling` (3). `flowStage` is a hint the AI planner uses to
auto-order equipment it identifies — not an enforced rule.

### Equipment (API shape — `specs` already parsed from its stored JSON string)
```jsonc
{
  "id": "uuid",
  "name": "J-1175 Jaw Crusher",       // the specific model (see table note above)
  "model": "Terex Finlay",             // the brand
  "category": "crushing",
  "icon": "crusher-jaw",
  "specs": { "Power": "125 hp" },      // free-form, often {}
  "imagePath": "/uploads/xxxx.jpg",    // or null
  "brochureUrl": "https://...",        // or null
  "stockUrl": "https://...",           // or null
  "createdAt": "2026-...", "updatedAt": "2026-..."
}
```

### Safe user (never includes `passwordHash`/`invitationTokenHash` — `auth.toSafeUser()`)
```jsonc
{
  "id": "uuid", "firstName": "...", "lastName": "...", "email": "...",
  "role": "admin|manager|staff", "status": "invited|active|inactive",
  "createdAt": "...", "updatedAt": "...", "lastLoginAt": "..." // or null
}
```

### Plant project (full, as returned by `GET /api/plants/:id`)
```jsonc
{
  "id": "uuid", "name": "...", "ownerId": "uuid",
  "status": "active", "version": 3, "thumbnail": null,
  "createdBy": "uuid", "updatedBy": "uuid",
  "createdAt": "...", "updatedAt": "...", "lastOpenedAt": "...",
  "data": { "nodes": [...], "connectors": [...], "shapes": [...], "lines": [...], "junctions": [...] }
}
```
The **summary** shape returned by `GET /api/plants` (list) and
`GET /api/plants-all` omits `data`/`createdBy`/`updatedBy` — list views
don't need the full canvas payload. `listAll()` (the admin/manager "All
Plants" view) adds one extra field: `ownerName`.

### The canvas `data` blob — one entry per array, each object exactly as
the canvas engine keeps it in memory (`public/js/app.js`), serialized
straight to/from JSON by `storage.js` on save/load:

**node** (`app.js:534-549`, an equipment placement) — the catalog item
itself is looked up by `equipmentId` at render time, not duplicated here:
```jsonc
{ "id": "node-7", "equipmentId": "<catalog uuid>", "x": 120, "y": 240,
  "width": 140, "height": 90, "notes": "" }
```

**connector** (`app.js:1653-1671`, a line between two "boxes" — a node,
shape, or junction, by id):
```jsonc
{ "id": "conn-3", "from": "node-7", "to": "junction-1",
  "style": { "strokeColor": "#1f2430", "strokeWidth": 2, "lineType": "solid", "arrowStart": false, "arrowEnd": true },
  "routing": { "mode": "auto", "style": "orthogonal", "points": [] }, // style: "orthogonal" | "angled"; points: user-added waypoints
  "label": null } // or a string
```

**shape** (`app.js:2175-2192` — a Tools-panel shape: `note`, `rect`,
`stockpile`, etc., `SHAPE_DEFAULTS` in app.js has the full kind list):
```jsonc
{ "id": "shape-2", "kind": "note", "x": 300, "y": 150, "width": 160, "height": 90,
  "text": "Note",
  "textStyle": { "fontSize": 12.5, "bold": false, "italic": false, "color": "#1f2430", "align": "left" } }
```

**line** (`app.js:2224-2238` — a freeform drawn line, distinct from a
connector: not attached to any box's edges):
```jsonc
{ "id": "line-1", "x1": 100, "y1": 200, "x2": 260, "y2": 200,
  "style": { "strokeColor": "#1f2430", "strokeWidth": 2, "lineType": "solid", "arrowStart": false, "arrowEnd": true } }
```

**junction** (`app.js:2204-2217` — an explicit "lines meet/branch here"
point, distinct from an incidental crossing of two unrelated connectors):
```jsonc
{ "id": "junction-1", "x": 290, "y": 235, "width": 16, "height": 16 }
```

### Command layer commands (`app.js:2468-2513`'s `applyCommand` switch —
the structured mutation format both manual UI actions and the AI panel
funnel through, enabling one shared undo/redo + batch/preview system)
```jsonc
{ "type": "addNode", "equipmentId": "...", "x": 100, "y": 100 }
{ "type": "addConnector", "from": "node-1", "to": "node-2" }
{ "type": "addShape", "kind": "note", "x": 300, "y": 100, "text": "optional" }
{ "type": "addLine", "x": 300, "y": 100 }
{ "type": "addJunction", "x": 300, "y": 100 }
{ "type": "deleteBox", "id": "..." }        // node, shape, or junction
{ "type": "deleteConnector", "id": "..." }
{ "type": "moveBox", "id": "...", "x": 120, "y": 140 }
{ "type": "setNodeNotes", "id": "...", "notes": "..." }
{ "type": "setConnectorLabel", "id": "...", "label": "..." }
```
`applyCommandBatch(commands, { preview })` runs a list of these as one
unit — `preview: true` applies them live without touching undo history
(for the AI panel's draft-before-confirm flow); `commitPendingBatch()` /
`discardPendingBatch()` resolve it.

### AI plant-input pipeline shapes
**Plant spec** — the intermediate format between a prompt and canvas
commands (`public/js/ai-plan.js`'s input, built by `server/ai.js`):
```jsonc
{
  "equipment": [ { "ref": "e1", "equipmentId": "<real catalog uuid>" } ],
  "connections": [ { "from": "e1", "to": "e2" } ],
  "notes": [ { "text": "...", "near": "e1" } ]  // optional, not currently populated by the stub planner
}
```
**`POST /api/ai/plan` response** (`server/ai.js`'s `planFromPrompt`):
```jsonc
{
  "spec": { "equipment": [...], "connections": [...] },     // as above, ready for planSpecToCommands
  "matched": [ { "ref": "e1", "phrase": "a jaw crusher", "name": "J-1175 Jaw Crusher" } ],
  "unmatchedPhrases": [ "a widget sprinkler" ],                // phrases with no catalog match -- never guessed at
  "stub": true   // always true today -- marks this as the keyword-match stub, not a real LLM
}
```

## 3. Full API reference

Base: the Express app serves both the API and `public/` from one
process (`server/server.js`). `auth` column: **public** (no cookie
needed), **auth** (`requireAuth` — any logged-in, active user), or a
role list (`requireRole(...)`, always layered on top of `requireAuth`).

| Method & path | Auth | Body (request) | Returns |
|---|---|---|---|
| `GET /api/categories` | public | — | `Category[]` |
| `POST /api/auth/login` | public | `{email, password}` | safe user, sets `pb_session` cookie |
| `POST /api/auth/logout` | public | — | 204, clears cookie |
| `GET /api/auth/me` | auth | — | safe user |
| `POST /api/auth/change-password` | auth | `{currentPassword, newPassword}` (≥8 chars) | 204 |
| `GET /api/auth/invitation/:token` | public | — | `{firstName, lastName, email}` or 404 |
| `POST /api/auth/invitation/:token/accept` | public | `{password}` (≥8 chars) | safe user, sets cookie |
| `GET /api/users` | **admin** | — | `SafeUser[]` |
| `POST /api/users` | **admin** | `{firstName, lastName, email, role}` | `{user, invitationLink}` — 409 if email taken |
| `PATCH /api/users/:id` | **admin** | `{role?, status?}` | updated safe user — 400 if it would remove the last active admin |
| `GET /api/plants` | auth | — | `PlantSummary[]`, caller's own, newest first |
| `POST /api/plants` | auth | `{name, data}` | full plant project, 201 |
| `GET /api/plants/:id` | auth | — | full plant project (owner-only, else 404) — bumps `lastOpenedAt` |
| `PUT /api/plants/:id` | auth | `{name?, data?}` | full plant project — `version` +1 |
| `PATCH /api/plants/:id` | auth | `{name}` | full plant project (rename only) |
| `POST /api/plants/:id/duplicate` | auth | — | new plant project, `"<name> (copy)"`, 201 |
| `DELETE /api/plants/:id` | auth | — | 204, soft-delete (`status: 'deleted'`) |
| `GET /api/plants-all` | **admin, manager** | — | `PlantSummary[]` + `ownerName`, every active user's plants |
| `GET /api/equipment` | public | — | `Equipment[]`, sorted by category then name |
| `GET /api/equipment/search?q=&category=&limit=` | auth | — | `Equipment[]`, relevance-scored, max 25 — the only lookup the AI planner uses |
| `GET /api/equipment/:id` | public | — | `Equipment` or 404 |
| `POST /api/ai/plan` | auth | `{prompt}` | AI response shape above — 400 if prompt is empty |
| `POST /api/equipment` | **admin** | multipart: `name, model, category, icon, specs(json), brochureUrl, stockUrl, image(file)` | new `Equipment`, 201 |
| `PUT /api/equipment/:id` | **admin** | multipart, same fields (all optional except what you're changing) + `removeImage` | updated `Equipment` |
| `DELETE /api/equipment/:id` | **admin** | — | 204, **hard delete**, no reference check (see `FEATURE-REVIEW.md` §1) |

Static: `public/` is served at `/`, uploaded images at `/uploads/<file>`.
A catch-all error handler returns `{error: message}` with the thrown
`HttpError`'s status (default 400) for anything above that throws.

## 4. Where to go next

- **To run/test/deploy it:** `HANDOVER.md`.
- **To find what's missing or worth building next:** `FEATURE-REVIEW.md`
  — its recommendations (categories as data, archive-not-delete,
  role-aware nav) map directly onto the tables and routes above.
- **Deep design rationale for *why* things are shaped this way**
  (phase-by-phase): `README.md`.
