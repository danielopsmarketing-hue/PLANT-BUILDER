# Feature & Permissions Review (handover prep)

Written in response to a request to review, before handover to the next
agent: (1) whether the backend's permissions/access, saving, navigation,
and editing capabilities are properly laid out, (2) what the drag-and-drop
canvas could add or amplify given what's already built, and (3) how
product/feature-library management (building new equipment entries)
could grow. This is a review + recommendations doc, not a changelog —
nothing below has been implemented yet. See "Suggested priority order"
at the end for what to tackle first, and flag anything you want
implemented now vs. left for the next agent.

## 1. Permissions & access — what's actually enforced today

Three roles, enforced **server-side** on every route via `requireAuth`/
`requireRole` (`server/auth.js`, `server/server.js`) — the real boundary,
not a UI suggestion:

| | Builder (canvas) | Own saved plants | Equipment Library (CRUD) | Users admin | All Plants (read-only, everyone's) |
|---|---|---|---|---|---|
| **staff** | yes | yes | no | no | no |
| **manager** | yes | yes | no | no | **yes** |
| **admin** | yes | yes | **yes** | **yes** | yes |

This matrix is solid and already tested (`server/tests/accounts.spec.js`,
`admin-pages.spec.js`). Three real gaps found on review:

- **Navigation isn't role-aware.** Every page's top nav
  (`public/*.html`, the `<nav class="main-nav">` block) hard-codes all
  four links — Builder / Equipment Library / All Plants / Users —
  identically regardless of who's logged in. A staff user sees "Equipment
  Library" and "Users" in their nav on every page, clicks either, and
  gets a jarring full-page "Access denied" swap (see each page's inline
  `<script type="module">` block). The enforcement is correct; the nav
  just doesn't reflect it. Cheap, high-value fix: have each page's boot
  script (where it already has `user.role` from `requireLogin()`) hide
  the links it knows will 403, instead of only gating what happens after
  the click.
- **No "editor" role distinct from admin.** Right now, editing the
  equipment catalog is bundled with the Users admin page under the same
  `admin` role — there's no way to grant someone catalog-editing rights
  without also handing them user management and the ability to change
  anyone's role (including their own account's). If the intent is "I
  edit the product library, but account/user management stays separate,"
  that's a 4th role (`editor` or similar) and a few `requireRole(...)`
  calls to adjust in `server.js` — small change, but a real decision
  about who should be able to do what, worth confirming before building.
- **Deleting a catalog item is a hard delete with no reference check**
  (`server/db.js`'s `remove()`). A saved plant stores `equipmentId`
  references inside its own JSON blob (`plant_projects.data`), not as a
  foreign key, so deleting equipment that's used in an existing saved
  layout doesn't error — it silently orphans those nodes. The canvas
  already degrades gracefully rather than crashing (`app.js` shows `"?"`
  for the name and no icon when `getEquipmentById()` comes back null),
  but there's no warning to the admin at delete time, and no way to
  un-delete. An **archive/deactivate flag** (keep the row, hide it from
  the picker, show a "discontinued" badge wherever it's still referenced)
  would be a safer default than hard delete for a catalog that's
  actively growing — same pattern already used for user deactivation and
  plant soft-delete elsewhere in this codebase.

## 2. Saving & editing — what's solid, what's missing

**Solid:** plant layouts are real owned records via `/api/plants`
(`server/plants.js`), not `localStorage` — create/update/duplicate/
rename/soft-delete, autosave 2s after an edit once a layout has been
saved once, ownership enforced server-side (one user can't load or edit
another's plant by guessing an ID — tested). Equipment catalog editing
(`admin.html`) covers name/model/category/icon/specs/image/brochure
link/stock-check link through a real create/update/delete API.

**Missing, in rough order of how often you'd feel it:**
- **Categories are hard-coded**, not data. `CATEGORIES` lives as a plain
  JS array in `server/seed-data.js` and is served read-only from
  `GET /api/categories` — there is no table, no CRUD API, and no admin UI
  for it. Adding a genuinely new category (not just a new item in an
  existing one) today means editing that file and restarting the server,
  which isn't something a non-technical catalog editor could do. This is
  probably the single most limiting thing for "building new products" if
  a new product doesn't fit the existing 8 categories (feeding, crushing,
  screening, conveying, stockpiling, washing, shredding, mixing).
- **No bulk import/export.** Every equipment edit goes through the
  one-at-a-time modal. Fine at 77 items; tedious well before 200+. A CSV
  import/export round-trip (reusing the same validation `create`/
  `update` already do) would make growing the catalog far less painful
  than clicking "Add Equipment" repeatedly.
- **No clone/duplicate action** on an existing equipment row — every new
  product variant (e.g. a different size of an existing crusher) is
  built from a blank form instead of "copy this one and change what's
  different."
- **No audit trail on equipment** (who added/edited a listing, and when)
  — plant projects already track `createdBy`/`updatedBy`; equipment only
  tracks `createdAt`/`updatedAt`, not by whom. Minor, but inconsistent
  with the rest of the data model.
- **Icon choices are a fixed enum** (12 options in `admin.html`'s
  `#field-icon` `<select>`, matched to hand-drawn SVGs in
  `public/js/icons.js`). A genuinely new equipment category would need a
  new icon added to that file by someone editing code — there's no
  upload-your-own-icon path. (Separately: SVG upload for equipment
  *images* was deliberately excluded for security reasons in an earlier
  review — this icon enum is a different, lower-risk thing since these
  are fixed, developer-authored assets, not user uploads.)

## 3. Drag-and-drop canvas — what's there, what could amplify it

**Already built** (so the next agent doesn't duplicate effort): custom
mouse-based drag (not HTML5 DnD) from a searchable/collapsible categorized
palette; free-form node placement with alignment guides and object snap;
orthogonal and angled (45°-snapped) connector routing with full style
control (color/width/dash/arrows) and a contextual style panel; rich-text
notes/shapes; explicit junction nodes distinct from incidental line
crossings (with crossing-bridge arcs only for the latter); multi-select
and rubber-band select; an align/distribute toolbar; keyboard shortcuts
(nudge, duplicate, select-all, copy/paste); a right-click context menu;
a structured command layer with batched, previewable undo/redo (the same
mechanism both manual edits and the AI draft panel use); PNG export; and
an AI assistant that drafts a layout from a text prompt, previews it live,
and only commits on explicit confirm.

**Features that would be natural amplifications of what's already there**
(not new paradigms — each one extends a mechanism that already exists):
- **Reusable sub-layout templates.** The AI planner already knows how to
  lay out a *named* equipment sequence from a spec
  (`public/js/ai-plan.js`'s `planSpecToCommands`); the same machinery
  could save a selected group of nodes/connectors as a named template
  ("standard 3-stage crushing circuit") and drop it back onto a canvas as
  one unit via the existing command-batch + preview/confirm flow — no new
  undo/history model needed, it'd reuse `applyCommandBatch`.
- **Grouping.** Multi-select already exists for moving several things at
  once, but there's no way to save that as a persistent group (move/lock
  together, ungroup later). This is the more general version of the
  template idea above and would make large layouts much easier to
  reorganize.
- **Equipment search/favorites in the palette.** The catalog panel has
  category search already; a small "recently used" or "favorites" row at
  the top (same data already in `app.equipment`, just a usage-count/
  localStorage overlay) would speed up building layouts with a rep's
  go-to equipment.
- **Version history on a saved plant**, not just the current state. The
  `version` counter on `plant_projects` already increments on every save
  but nothing reads it for anything — a simple "view a previous version
  (read-only)" using that number, without a full diff UI, would be a
  small addition with real value for "I changed something and want the
  old layout back."
- **A "discontinued equipment" visual flag on the canvas** — ties
  directly to the archive/deactivate idea in §1: if a node's catalog item
  is archived rather than hard-deleted, show it with a warning badge
  instead of silently becoming `"?"`.

None of this requires re-architecting anything — the command layer,
catalog, and plant-persistence APIs were already built with headroom for
exactly this kind of extension.

## 4. Managing the product library going forward

Putting §1–§3's catalog-specific points together, if the goal is "I want
to comfortably keep building out the product library myself over time,"
the highest-leverage combination is:
1. Turn categories into real data (own table + CRUD API + a small admin
   UI section) instead of a hard-coded file.
2. Add clone/duplicate on an equipment row.
3. Switch delete to archive/deactivate (keep history, hide from new
   layouts, flag existing references instead of breaking them).
4. Add CSV import/export once the catalog is past "add things one at a
   time is fine."

That's a coherent, scoped chunk of backend + admin-UI work — not a canvas
change at all — which fits naturally as the next agent's first real task
once handover is complete.

## Suggested priority order

If anything here gets built before handover rather than after, this is
the order it'd pay off fastest:
1. Role-aware nav (cheap, fixes a real daily annoyance for staff/manager
   users).
2. Archive instead of hard-delete for equipment (prevents silent data
   corruption in saved plants, low effort).
3. Categories as real data + admin UI (unblocks "building new products"
   outside the current 8 categories — the biggest actual limitation
   found in this review).
4. Clone/duplicate + CSV import/export (quality-of-life, do once the
   catalog is actively growing).
5. Canvas amplifications (templates/grouping/version history) — valuable,
   but additive polish rather than something blocking current use.

The "editor role" question in §1 needs your decision (who should be able
to do what) before any of the above touches `requireRole(...)` — it's
not something to guess at and implement.
