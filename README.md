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

The equipment catalog now has a real backend: a small Express API backs a
central catalog with an admin UI for managing listings (including image
uploads), and the sales-facing builder reads from it live. Saved *layouts*
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

On first run the server seeds `server/data/equipment.json` with the
placeholder catalog (from `server/seed-data.js`). Edit, replace, or wipe
that file from the admin UI — nothing about it is permanent.

### Protecting the admin page

The Equipment Library page and every catalog-editing request (add/edit/
delete, image upload) are gated behind HTTP Basic Auth — but only when
`ADMIN_USERNAME` and `ADMIN_PASSWORD` env vars are set. Unset (the local
default), there's no login prompt at all, so local dev stays frictionless.
**Before deploying anywhere reachable from outside your machine, set both**,
or anyone with the URL can rewrite or delete the whole catalog:

```
ADMIN_USERNAME=youradminname ADMIN_PASSWORD=a-real-password npm start
```

The builder itself (`index.html`) and the read-only catalog API stay public
either way — reps don't need a login to build layouts.

### What it does

**Builder (`index.html`)**

- Tools panel: drag a Rectangle, Ellipse, Note, or Line onto the canvas as
  a freeform annotation, independent of equipment (drawio-style basic
  shapes). Each is draggable, resizable (rect/ellipse/note via corner
  handle), and editable — rect/ellipse/note get a text label through the
  Inspector, lines get two draggable endpoint handles when selected.
  Delete like anything else on the canvas; all of it participates in
  undo/redo and gets included in the PNG export.
- Equipment catalog panel, grouped by category, searchable, collapsible
  groups, drag-and-drop onto canvas
- Canvas nodes: place, move, resize (drag the corner handle, like drawio),
  select, delete
- Directional connectors, drawio-style magnets: hover a node *or* a Tools
  shape to reveal four connection dots, drag from one to another (any mix
  of equipment/shapes) to draw an arrow; click a connector to select it,
  then delete. Freeform lines magnet-snap to a node/shape edge too when you
  drag an endpoint near one, or fall back to the grid otherwise.
- Snap-to-grid: dropping, moving, or resizing a node or shape snaps to the
  24px grid (matching the visible background grid). Hold Alt while
  dragging to place freely without snapping.
- Undo/redo (toolbar buttons or Ctrl+Z / Ctrl+Shift+Z), covering adds,
  deletes, moves, resizes, and connections
- Inspector panel: selected item's spec sheet, position, a **View
  Brochure** button (only shown when that equipment has a brochure link
  set in the catalog), and a free-text notes field
- Zoom (scroll wheel, toolbar buttons) and pan (drag empty canvas)
- Export to a branded PNG (via html2canvas), including a simple equipment
  list alongside the flow diagram
- Save/load via browser `localStorage` — **this is not real persistence**,
  it's a stand-in that proves the save/load interaction works. Layouts do
  not sync across browsers, devices, or users.

**Admin (`admin.html`)**

- Table of every catalog item with thumbnail, name, model, category, and
  brochure status
- Add/edit form: name, model, category, a placeholder icon (used as the
  fallback shape until a real image is uploaded), an image upload, an
  arbitrary list of spec rows (label + value), and a brochure link
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
of the visual load than before: crushers now render distinct jaw/cone/
impact silhouettes instead of one generic shape (seeded automatically by
matching each product's name), and hopper/screen/conveyor/stacker got
simple support-leg details for a more equipment-like, AggFlow-style read
at a glance. These are still line-art placeholders, not photos — they
render both in the catalog panel and on canvas nodes (same `thumbHtml()`
path), and get replaced automatically the moment a real image is uploaded
for that item.

### Project layout

```
server/
  server.js       — Express app: static hosting + REST API + uploads
  db.js           — JSON-file-backed CRUD for the equipment catalog
  seed-data.js    — placeholder catalog loaded on first run
  data/           — equipment.json lives here (gitignored)
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

## Deploying (Railway)

Two things the host needs to support, because the catalog store and
uploaded images are files on disk, not a database: a long-running Node
process (not pure serverless), and a **persistent volume** — some hosts
wipe local disk on every redeploy, which would silently erase the catalog.

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
5. In **Variables**, set `ADMIN_USERNAME` and `ADMIN_PASSWORD` (see above).
   Railway sets `PORT` automatically — the app already reads
   `process.env.PORT`, no change needed.
6. Deploy. Railway gives you a `*.up.railway.app` URL — the builder is at
   `/`, the catalog admin at `/admin.html`.

## What needs to be built next

1. **Saved-layout persistence** — layouts still live in `localStorage`
   only. Moving them server-side (with the same JSON-file or a real DB) is
   the next piece, same shape as the equipment catalog work just done.
2. **Accounts/auth** — reps log in; layouts are tied to an account. The
   admin page now has a basic password gate, but that's separate from
   rep-facing accounts, which are still needed before saved-layout
   persistence can be multi-user.

## Constraints that should not change without a conversation

- No engineering/throughput calculations. Visual layout only.
- Equipment catalog is centrally managed, not per-rep. (Now enforced by
  the backend — there's no per-rep catalog editing path in the builder.)
- Export needs to stay presentation-quality — this is a sales leave-behind,
  not a technical drawing.

## Open decisions (need your input before or during the next phase)

- Real logo file — see note above.
- Real equipment lineup is now in (77 products from the spreadsheet), but
  specs, product photos, and brochure links are still empty — the admin UI
  is ready for these, someone needs to fill them in (see "Product images"
  above for photos specifically).
- Whether reps can see each other's customer layouts, or only their own —
  this determines the data model for saved-layout persistence and hasn't
  been decided.
- ~~Hosting preference~~ — Railway, see "Deploying" above.

Answering the rest unblocks the remaining backend/auth work.
