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
- **Orthogonal connectors, auto-routed**: hover a node or Tools shape to
  reveal four arrow chevrons outside its edges, drag from one to another
  (any mix of equipment/shapes) to connect them. Connections render as
  clean Manhattan (horizontal/vertical-only) paths with small rounded
  corners, not straight diagonal lines — a straight run when the two
  anchor points already line up, otherwise a single routed bend through
  the midpoint. The path is recomputed from live box positions on every
  render, so moving either end reroutes automatically; nothing is stored
  as fixed screen coordinates. Freeform lines (from the Tools panel) stay
  simple two-point lines and still magnet-snap to a node/shape edge.
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
this is the foundation + connections + editing phases, not the whole
thing): draggable waypoints/manual segment editing on a connector once
it's created, junction nodes and automatic line-crossing bridges (two
unrelated connectors that cross currently just overlap visually), a
connection can't carry a text label yet, no persistent object grouping or
locking, no minimap, and routing avoids nothing — it doesn't yet route
*around* equipment that sits between two connected items, just between
their anchor points. All of these are real follow-up work, not corners
intentionally cut for the demo.

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
  specs, product photos, brochure links, and stock-check links are still
  empty — the admin UI is ready for all of these, someone needs to fill
  them in (see "Product images" above for photos specifically).
- Whether reps can see each other's customer layouts, or only their own —
  this determines the data model for saved-layout persistence and hasn't
  been decided.
- ~~Hosting preference~~ — Railway, see "Deploying" above.

Answering the rest unblocks the remaining backend/auth work.
