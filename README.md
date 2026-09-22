# Plant Builder

A drag-and-drop visual tool for sales reps: drag crushing/screening
equipment onto a canvas, arrange it into a flow (hopper → crusher → screen
→ conveyors → stockpile), connect it with directional arrows, and export
the result as a branded PNG for a customer quote or proposal.

**This is a sales/presentation tool, not an engineering tool.** There is no
throughput math, no tonnage calculation, and no compatibility validation
between equipment. If a layout looks right and reads clearly, it's correct.
Keep it that way — see "Constraints" below.

## Current state: single-user prototype

This is a static, single-browser HTML/JS/CSS prototype. No build step, no
backend. Open `index.html` in a browser (or serve the folder statically)
and it works.

What it does:

- Equipment catalog panel, grouped by category, drag-and-drop onto canvas
- Canvas nodes: place, move, select, delete
- Directional connectors: toggle "Connect" mode, click two nodes to draw an
  arrow between them; click a connector, then delete it
- Inspector panel: selected item's spec sheet, position, and a free-text
  notes field
- Zoom (scroll wheel, toolbar buttons) and pan (drag empty canvas)
- Export to a branded PNG (via html2canvas), including a simple equipment
  list alongside the flow diagram
- Save/load via browser `localStorage` — **this is not real persistence**,
  it's a stand-in that proves the save/load interaction works. Layouts do
  not sync across browsers, devices, or users.

Project layout:

```
index.html
css/styles.css     — all styling, including the off-screen export layout
js/catalog-data.js — placeholder equipment catalog
js/icons.js         — placeholder geometric icons per equipment category
js/storage.js       — localStorage save/load
js/app.js           — canvas, nodes, connectors, inspector, export, app wiring
```

Placeholder branding ("Ironpeak Equipment") and a placeholder equipment
catalog (generic jaw/cone/impact crushers, screens, conveyors, a radial
stacker, a stockpile) are in place so the prototype is clickable. Both need
to be replaced with real data — see "Open decisions" below.

## What needs to be built next

The prototype validates the UI. The real work ahead is turning this into a
multi-user, persisted, deployed application:

1. **Backend + database** — equipment catalog, saved layouts, and
   connectors need to live server-side, not in browser `localStorage`.
2. **Accounts/auth** — reps log in; layouts are tied to an account.
3. **Central equipment catalog with admin management** — one source of
   truth for equipment data, maintained by sales ops, not by individual
   reps.
4. **Real branding and real equipment data** — replace every placeholder.
5. **Deployment** — hosted somewhere reps can reach from anywhere, not a
   local file.

None of this has been started yet; the items below need answers first.

## Constraints that should not change without a conversation

- No engineering/throughput calculations. Visual layout only.
- Equipment catalog is centrally managed, not per-rep.
- Export needs to stay presentation-quality — this is a sales leave-behind,
  not a technical drawing.

## Open decisions (need your input before or during the next phase)

These are flagged, not guessed at, per the project brief:

- Real company name, logo, brand colors — the prototype uses a placeholder
  brand ("Ironpeak Equipment", navy/amber) purely so the export looks
  finished.
- Real equipment lineup: model names, categories, key specs to display,
  and any images/icons we have rights to use — the prototype uses generic
  placeholder models and simple geometric icons.
- Whether reps can see each other's customer layouts, or only their own —
  this determines the data model and permissions for phase 2 and hasn't
  been decided.
- What exactly the exported file needs to include beyond the flow image —
  the prototype now includes a simple equipment list (name, model, notes)
  under the diagram as a starting point; confirm this is the right shape,
  still no math.
- Hosting preference, if there is one already.

Answering these unblocks the backend/auth/deployment phase.
