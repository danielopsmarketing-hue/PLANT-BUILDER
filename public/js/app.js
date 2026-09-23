import { iconSvg, colorForCategory } from "./icons.js";
import { listLayouts, saveLayout, loadLayout, deleteLayout } from "./storage.js";
import { fetchCategories, fetchEquipment } from "./api.js";

const DEFAULT_NODE_WIDTH = 196;
const DEFAULT_NODE_HEIGHT = 130;
const MIN_NODE_WIDTH = 96;
const MIN_NODE_HEIGHT = 64;
const MAX_NODE_WIDTH = 400;
const MAX_NODE_HEIGHT = 280;
const MAX_HISTORY = 60;

const MIN_SHAPE_SIZE = 40;
const MAX_SHAPE_SIZE = 600;
const SHAPE_DEFAULTS = {
  rect: { width: 140, height: 90 },
  ellipse: { width: 140, height: 90 },
  note: { width: 160, height: 90 },
  stockpile: { width: 120, height: 100 },
};
const LINE_DEFAULT_LENGTH = 140;
const GRID_SIZE = 24; // matches the visual canvas background grid
const MAGNET_RADIUS = 14; // how close a line endpoint must be to a box edge to snap

class PlantBuilderApp {
  constructor() {
    this.categories = [];
    this.equipment = [];
    this.equipmentById = new Map();

    this.nodes = new Map();
    this.connectors = new Map();
    this.shapes = new Map(); // freeform rect/ellipse/note annotations, not tied to equipment
    this.lines = new Map(); // freeform lines/arrows, not tied to equipment nodes
    this.selection = []; // array of { type: 'node' | 'connector' | 'shape' | 'line', id } -- multi-select capable
    this.view = { scale: 1, panX: 40, panY: 40 };
    this.currentLayoutId = null;
    this.nextId = 1;
    this.collapsedCategories = new Set();
    this.searchTerm = "";
    this.spaceHeld = false;
    this._clipboard = null;

    this.history = [];
    this.historyIndex = -1;

    this.els = {
      viewport: document.getElementById("canvas-viewport"),
      world: document.getElementById("canvas-world"),
      svg: document.getElementById("connector-layer"),
      guideLayer: document.getElementById("guide-layer"),
      contextMenu: document.getElementById("context-menu"),
      emptyHint: document.getElementById("canvas-empty-hint"),
      catalogList: document.getElementById("catalog-list"),
      catalogSearch: document.getElementById("catalog-search"),
      inspectorContent: document.getElementById("inspector-content"),
      zoomLevel: document.getElementById("zoom-level"),
      loadSelect: document.getElementById("load-select"),
      modalBackdrop: document.getElementById("modal-backdrop"),
      modalTitle: document.getElementById("modal-title"),
      modalInput: document.getElementById("modal-input"),
    };

    this.bindToolbar();
    this.bindCanvasEvents();
    this.bindKeyboard();
    this.bindCatalogSearch();
    this.bindToolsPanel();
    this.refreshLayoutList();
    this.applyViewTransform();
    this.render();
    this.resetHistory();

    this.loadCatalog();
  }

  // ---------- Catalog panel ----------

  async loadCatalog() {
    this.els.catalogList.innerHTML = `<p class="catalog-loading">Loading equipment&hellip;</p>`;
    try {
      const [categories, equipment] = await Promise.all([fetchCategories(), fetchEquipment()]);
      this.categories = categories;
      this.equipment = equipment;
      this.equipmentById = new Map(equipment.map((e) => [e.id, e]));
      this.buildCatalogPanel();
      this.render(); // node specs/images may have changed
    } catch (err) {
      console.error(err);
      this.els.catalogList.innerHTML = `<p class="catalog-loading">Couldn't load the equipment catalog. Is the server running?</p>`;
    }
  }

  getEquipmentById(id) {
    return this.equipmentById.get(id) || null;
  }

  bindCatalogSearch() {
    this.els.catalogSearch.addEventListener("input", (e) => {
      this.searchTerm = e.target.value.trim().toLowerCase();
      this.buildCatalogPanel();
    });
    document.getElementById("btn-catalog-refresh").addEventListener("click", () => this.loadCatalog());
  }

  buildCatalogPanel() {
    const list = this.els.catalogList;
    list.innerHTML = "";

    for (const category of this.categories) {
      const items = this.equipment.filter((e) => {
        if (e.category !== category.id) return false;
        if (!this.searchTerm) return true;
        return (
          e.name.toLowerCase().includes(this.searchTerm) ||
          (e.model || "").toLowerCase().includes(this.searchTerm)
        );
      });
      if (items.length === 0) continue;

      const collapsed = this.collapsedCategories.has(category.id);

      const group = document.createElement("div");
      group.className = "catalog-group";

      const heading = document.createElement("button");
      heading.type = "button";
      heading.className = "catalog-group-heading";
      heading.innerHTML = `<span class="chevron ${collapsed ? "collapsed" : ""}">&#9662;</span> ${category.label}`;
      heading.addEventListener("click", () => {
        if (collapsed) this.collapsedCategories.delete(category.id);
        else this.collapsedCategories.add(category.id);
        this.buildCatalogPanel();
      });
      group.appendChild(heading);

      const itemsWrap = document.createElement("div");
      itemsWrap.className = "catalog-group-items";
      if (collapsed) itemsWrap.style.display = "none";

      for (const item of items) {
        const el = document.createElement("div");
        el.className = "catalog-item";
        el.dataset.equipmentId = item.id;
        el.innerHTML = `
          <span class="catalog-item-icon">${this.thumbHtml(item)}</span>
          <span class="catalog-item-label">
            <span class="catalog-item-name">${escapeHtml(item.name)}</span>
            <span class="catalog-item-model">${escapeHtml(item.model || "")}</span>
          </span>`;
        el.addEventListener("mousedown", (e) => {
          this.startPaletteDrag(e, this.thumbHtml(item), (x, y) => {
            this.addNode(item.id, x - DEFAULT_NODE_WIDTH / 2, y - DEFAULT_NODE_HEIGHT / 2);
          });
        });
        itemsWrap.appendChild(el);
      }
      group.appendChild(itemsWrap);
      list.appendChild(group);
    }

    if (list.children.length === 0) {
      list.innerHTML = `<p class="catalog-loading">No equipment matches "${escapeHtml(this.searchTerm)}".</p>`;
    }
  }

  // Custom drag from a palette (catalog item or tool item) onto the canvas.
  // Native HTML5 drag-and-drop was the source of a real bug: the browser's
  // own drag gesture doesn't track the same way our other mouse-driven
  // interactions do, and the ghost/drop state could linger or misbehave
  // once the cursor left the source element. This is the same
  // mousedown/mousemove/mouseup pattern used for moving nodes, so it
  // behaves identically and predictably.
  startPaletteDrag(e, ghostHtml, onDrop) {
    e.preventDefault();
    const ghost = document.createElement("div");
    ghost.className = "palette-drag-ghost";
    ghost.innerHTML = ghostHtml;
    document.body.appendChild(ghost);

    const moveGhost = (clientX, clientY) => {
      ghost.style.left = `${clientX}px`;
      ghost.style.top = `${clientY}px`;
    };
    moveGhost(e.clientX, e.clientY);

    const isOverCanvas = (clientX, clientY) => {
      const rect = this.els.viewport.getBoundingClientRect();
      return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
    };

    let overCanvas = false;
    const onMove = (ev) => {
      moveGhost(ev.clientX, ev.clientY);
      const nowOver = isOverCanvas(ev.clientX, ev.clientY);
      if (nowOver !== overCanvas) {
        overCanvas = nowOver;
        this.els.viewport.classList.toggle("drag-over", overCanvas);
      }
    };
    const onUp = (ev) => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      ghost.remove();
      this.els.viewport.classList.remove("drag-over");
      if (isOverCanvas(ev.clientX, ev.clientY)) {
        const { x, y } = this.clientToWorld(ev.clientX, ev.clientY);
        onDrop(x, y);
      }
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  thumbHtml(item) {
    if (item.imagePath) {
      // draggable="false": browsers make <img> natively draggable, which would
      // otherwise hijack the drag gesture out from under the catalog card's
      // own drag-and-drop handling.
      return `<img src="${item.imagePath}" alt="${escapeHtml(item.name)}" class="thumb-img" draggable="false" />`;
    }
    return iconSvg(item.icon, item.category);
  }

  // ---------- Tools panel (drawio-style shapes/lines/notes) ----------

  bindToolsPanel() {
    for (const el of document.querySelectorAll(".tool-item")) {
      const kind = el.dataset.toolKind;
      el.addEventListener("mousedown", (e) => {
        const ghostHtml = el.querySelector("svg").outerHTML;
        this.startPaletteDrag(e, ghostHtml, (x, y) => {
          if (kind === "line") this.addLine(x, y);
          else this.addShape(kind, x, y);
        });
      });
    }
  }

  // ---------- Toolbar ----------

  bindToolbar() {
    document.getElementById("btn-new").addEventListener("click", () => this.newLayout());
    document.getElementById("btn-save").addEventListener("click", () => this.promptSave());
    document.getElementById("btn-load").addEventListener("click", () => this.loadSelected());
    document.getElementById("btn-delete-layout").addEventListener("click", () => this.deleteSelected());
    document.getElementById("btn-undo").addEventListener("click", () => this.undo());
    document.getElementById("btn-redo").addEventListener("click", () => this.redo());
    document.getElementById("btn-zoom-in").addEventListener("click", () => this.zoomBy(1.2));
    document.getElementById("btn-zoom-out").addEventListener("click", () => this.zoomBy(1 / 1.2));
    document.getElementById("btn-zoom-reset").addEventListener("click", () => this.resetView());
    document.getElementById("btn-export").addEventListener("click", () => this.exportPng());

    document.getElementById("modal-cancel").addEventListener("click", () => this.closeModal());
    document.getElementById("modal-confirm").addEventListener("click", () => this.confirmModal());
  }

  // ---------- Canvas: drop, pan, zoom, rubber-band select ----------
  //
  // Panning is Space+drag or middle-mouse-drag (draw.io convention); a plain
  // left-drag on empty canvas instead draws a selection rectangle -- so
  // "drag the canvas" never accidentally moves equipment, and "select
  // several things by dragging around them" always works without a modifier.

  bindCanvasEvents() {
    const viewport = this.els.viewport;

    viewport.addEventListener("wheel", (e) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      this.zoomBy(factor, e.clientX, e.clientY);
    }, { passive: false });

    viewport.addEventListener("contextmenu", (e) => e.preventDefault());

    let panning = false;
    let panStart = null;
    let rubberBand = null;

    const isCanvasBackground = (e) => e.target === viewport || e.target === this.els.world || e.target === this.els.svg || e.target === this.els.guideLayer;

    viewport.addEventListener("mousedown", (e) => {
      this.hideContextMenu();

      // Space/middle-mouse panning takes priority over whatever is under the
      // cursor -- including equipment -- so it works the same whether the
      // gesture starts on empty canvas or on top of a node/shape. (Node and
      // shape drag handlers also check spaceHeld and bail out early so this
      // listener still sees the event.)
      const wantsPan = e.button === 1 || (e.button === 0 && this.spaceHeld);
      if (wantsPan) {
        e.preventDefault();
        panning = true;
        viewport.classList.add("panning");
        panStart = { x: e.clientX, y: e.clientY, panX: this.view.panX, panY: this.view.panY };
        return;
      }

      if (!isCanvasBackground(e)) return;
      if (e.button !== 0) return;

      const additive = e.shiftKey;
      const rectEl = document.createElement("div");
      rectEl.className = "selection-rect";
      viewport.appendChild(rectEl);
      rubberBand = {
        startClientX: e.clientX,
        startClientY: e.clientY,
        startWorld: this.clientToWorld(e.clientX, e.clientY),
        rectEl,
        moved: false,
        additive,
      };
      if (!additive) this.setSelection([]);
    });

    window.addEventListener("mousemove", (e) => {
      if (panning) {
        this.view.panX = panStart.panX + (e.clientX - panStart.x);
        this.view.panY = panStart.panY + (e.clientY - panStart.y);
        this.applyViewTransform();
        return;
      }
      if (rubberBand) {
        const dx = e.clientX - rubberBand.startClientX;
        const dy = e.clientY - rubberBand.startClientY;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) rubberBand.moved = true;
        const vpRect = viewport.getBoundingClientRect();
        const left = Math.min(rubberBand.startClientX, e.clientX) - vpRect.left;
        const top = Math.min(rubberBand.startClientY, e.clientY) - vpRect.top;
        rubberBand.rectEl.style.left = `${left}px`;
        rubberBand.rectEl.style.top = `${top}px`;
        rubberBand.rectEl.style.width = `${Math.abs(dx)}px`;
        rubberBand.rectEl.style.height = `${Math.abs(dy)}px`;
      }
    });

    window.addEventListener("mouseup", (e) => {
      if (panning) {
        panning = false;
        viewport.classList.remove("panning");
        return;
      }
      if (rubberBand) {
        if (rubberBand.moved) {
          const endWorld = this.clientToWorld(e.clientX, e.clientY);
          const minX = Math.min(rubberBand.startWorld.x, endWorld.x);
          const maxX = Math.max(rubberBand.startWorld.x, endWorld.x);
          const minY = Math.min(rubberBand.startWorld.y, endWorld.y);
          const maxY = Math.max(rubberBand.startWorld.y, endWorld.y);
          const hits = [];
          for (const node of this.nodes.values()) {
            if (boxIntersectsRect(node, minX, minY, maxX, maxY)) hits.push({ type: "node", id: node.id });
          }
          for (const shape of this.shapes.values()) {
            if (boxIntersectsRect(shape, minX, minY, maxX, maxY)) hits.push({ type: "shape", id: shape.id });
          }
          if (rubberBand.additive) {
            const merged = [...this.selection];
            for (const h of hits) if (!merged.some((s) => s.type === h.type && s.id === h.id)) merged.push(h);
            this.setSelection(merged);
          } else {
            this.setSelection(hits);
          }
        }
        rubberBand.rectEl.remove();
        rubberBand = null;
      }
    });

    // Any click outside the context menu itself dismisses it.
    window.addEventListener("mousedown", (e) => {
      if (!this.els.contextMenu.contains(e.target)) this.hideContextMenu();
    }, true);
  }

  bindKeyboard() {
    window.addEventListener("keydown", (e) => {
      if (e.code === "Space" && e.target.tagName !== "INPUT" && e.target.tagName !== "TEXTAREA") {
        this.spaceHeld = true;
        this.els.viewport.classList.add("space-pan");
      }

      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;

      const mod = e.ctrlKey || e.metaKey;

      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) this.redo();
        else this.undo();
        return;
      }
      if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        this.redo();
        return;
      }
      if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        this.duplicateSelection();
        return;
      }
      if (mod && e.key.toLowerCase() === "a") {
        e.preventDefault();
        this.selectAll();
        return;
      }
      if (mod && e.key.toLowerCase() === "c") {
        e.preventDefault();
        this.copySelection();
        return;
      }
      if (mod && e.key.toLowerCase() === "x") {
        e.preventDefault();
        this.cutSelection();
        return;
      }
      if (mod && e.key.toLowerCase() === "v") {
        e.preventDefault();
        this.pasteClipboard();
        return;
      }
      if (e.key.startsWith("Arrow") && this.selection.length > 0) {
        e.preventDefault();
        const step = e.shiftKey ? GRID_SIZE : 1;
        const deltas = { ArrowUp: [0, -step], ArrowDown: [0, step], ArrowLeft: [-step, 0], ArrowRight: [step, 0] };
        const [dx, dy] = deltas[e.key];
        this.nudgeSelection(dx, dy);
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && this.selection.length > 0) {
        e.preventDefault();
        this.deleteSelection();
      } else if (e.key === "Escape") {
        this.cancelConnectDrag();
        this.setSelection([]);
        this.hideContextMenu();
      }
    });

    window.addEventListener("keyup", (e) => {
      if (e.code === "Space") {
        this.spaceHeld = false;
        this.els.viewport.classList.remove("space-pan");
      }
    });
  }

  clientToWorld(clientX, clientY) {
    const rect = this.els.viewport.getBoundingClientRect();
    const x = (clientX - rect.left - this.view.panX) / this.view.scale;
    const y = (clientY - rect.top - this.view.panY) / this.view.scale;
    return { x, y };
  }

  zoomBy(factor, clientX, clientY) {
    const rect = this.els.viewport.getBoundingClientRect();
    const cx = clientX !== undefined ? clientX - rect.left : rect.width / 2;
    const cy = clientY !== undefined ? clientY - rect.top : rect.height / 2;

    const newScale = Math.min(2.5, Math.max(0.3, this.view.scale * factor));
    const worldX = (cx - this.view.panX) / this.view.scale;
    const worldY = (cy - this.view.panY) / this.view.scale;

    this.view.scale = newScale;
    this.view.panX = cx - worldX * newScale;
    this.view.panY = cy - worldY * newScale;
    this.applyViewTransform();
  }

  resetView() {
    this.view = { scale: 1, panX: 40, panY: 40 };
    this.applyViewTransform();
  }

  applyViewTransform() {
    this.els.world.style.transform =
      `translate(${this.view.panX}px, ${this.view.panY}px) scale(${this.view.scale})`;
    this.els.zoomLevel.textContent = `${Math.round(this.view.scale * 100)}%`;
  }

  // ---------- Nodes ----------

  addNode(equipmentId, x, y) {
    const id = `node-${this.nextId++}`;
    this.nodes.set(id, {
      id,
      equipmentId,
      x: snapToGrid(x),
      y: snapToGrid(y),
      width: DEFAULT_NODE_WIDTH,
      height: DEFAULT_NODE_HEIGHT,
      notes: "",
    });
    this.selectOne("node", id);
    this.render();
    this.pushHistory();
    return id;
  }

  // A "box" is anything a connector can attach to: an equipment node or a
  // Tools-panel shape. Both have {id, x, y, width, height}, so connectors,
  // magnets, and grid-snap all work the same way regardless of which.
  getBox(id) {
    return this.nodes.get(id) || this.shapes.get(id) || null;
  }

  boxLabel(id) {
    const node = this.nodes.get(id);
    if (node) return this.getEquipmentById(node.equipmentId)?.name || "?";
    const shape = this.shapes.get(id);
    if (shape) return { rect: "Rectangle", ellipse: "Ellipse", note: "Note", stockpile: "Stockpile" }[shape.kind] || "Shape";
    return "?";
  }

  removeConnectorsFor(id) {
    for (const [cid, c] of this.connectors) {
      if (c.from === id || c.to === id) this.connectors.delete(cid);
    }
  }

  deleteNode(id) {
    this.nodes.delete(id);
    this.removeConnectorsFor(id);
  }

  deleteConnector(id) {
    this.connectors.delete(id);
  }

  // ---------- Selection / Inspector ----------
  //
  // this.selection is an array of { type, id } entries -- empty means
  // nothing selected. A single entry drives the per-type Inspector detail
  // view; two or more switches the Inspector to a summary + align/distribute
  // panel. Everything (rubber-band select, shift-click, group drag, delete,
  // duplicate, copy/paste) operates over this same array.

  setSelection(entries) {
    this.selection = entries || [];
    this.renderInspector();
    // A line's endpoint handles are only created inside renderConnectors's
    // SVG rebuild (renderFreeLines), not just toggled like the .selected
    // class elsewhere -- so selecting/deselecting a line needs a real
    // re-render, not just renderSelectionHighlight's class toggling.
    this.renderConnectors();
  }

  selectOne(type, id) {
    this.setSelection([{ type, id }]);
  }

  isSelected(type, id) {
    return this.selection.some((s) => s.type === type && s.id === id);
  }

  toggleSelection(type, id) {
    if (this.isSelected(type, id)) {
      this.setSelection(this.selection.filter((s) => !(s.type === type && s.id === id)));
    } else {
      this.setSelection([...this.selection, { type, id }]);
    }
  }

  selectAll() {
    const all = [
      ...Array.from(this.nodes.keys()).map((id) => ({ type: "node", id })),
      ...Array.from(this.shapes.keys()).map((id) => ({ type: "shape", id })),
    ];
    this.setSelection(all);
  }

  // The subset of the current selection that are boxes (nodes/shapes) --
  // i.e. things align/distribute/duplicate/drag-as-group can act on.
  selectedBoxes() {
    return this.selection
      .map((sel) => ((sel.type === "node" || sel.type === "shape") ? { sel, box: this.getBox(sel.id) } : null))
      .filter((entry) => entry && entry.box);
  }

  deleteSelection() {
    if (this.selection.length === 0) return;
    for (const { type, id } of this.selection) {
      if (type === "node") this.deleteNode(id);
      else if (type === "shape") this.deleteShape(id);
      else if (type === "line") this.deleteLine(id);
      else this.deleteConnector(id);
    }
    this.selection = [];
    this.render();
    this.pushHistory();
  }

  nudgeSelection(dx, dy) {
    if (this.selection.length === 0) return;
    for (const { id } of this.selection) {
      const box = this.getBox(id);
      if (box) { box.x += dx; box.y += dy; }
    }
    this.render();
    this.pushHistory();
  }

  duplicateSelection() {
    if (this.selection.length === 0) return;
    const offset = GRID_SIZE;
    const idMap = new Map();
    const newSelection = [];

    for (const sel of this.selection) {
      if (sel.type === "node") {
        const orig = this.nodes.get(sel.id);
        if (!orig) continue;
        const newId = `node-${this.nextId++}`;
        this.nodes.set(newId, { ...orig, id: newId, x: orig.x + offset, y: orig.y + offset });
        idMap.set(sel.id, newId);
        newSelection.push({ type: "node", id: newId });
      } else if (sel.type === "shape") {
        const orig = this.shapes.get(sel.id);
        if (!orig) continue;
        const newId = `shape-${this.nextId++}`;
        this.shapes.set(newId, { ...orig, id: newId, x: orig.x + offset, y: orig.y + offset });
        idMap.set(sel.id, newId);
        newSelection.push({ type: "shape", id: newId });
      }
    }
    for (const conn of Array.from(this.connectors.values())) {
      if (idMap.has(conn.from) && idMap.has(conn.to)) {
        const newId = `conn-${this.nextId++}`;
        this.connectors.set(newId, { ...conn, id: newId, from: idMap.get(conn.from), to: idMap.get(conn.to) });
      }
    }
    if (newSelection.length === 0) return;
    this.setSelection(newSelection);
    this.render();
    this.pushHistory();
  }

  copySelection() {
    const nodeIds = new Set(this.selection.filter((s) => s.type === "node").map((s) => s.id));
    const shapeIds = new Set(this.selection.filter((s) => s.type === "shape").map((s) => s.id));
    if (nodeIds.size === 0 && shapeIds.size === 0) {
      this._clipboard = null;
      return;
    }
    this._clipboard = {
      nodes: [...nodeIds].map((id) => ({ ...this.nodes.get(id) })),
      shapes: [...shapeIds].map((id) => ({ ...this.shapes.get(id) })),
      connectors: Array.from(this.connectors.values())
        .filter((c) => (nodeIds.has(c.from) || shapeIds.has(c.from)) && (nodeIds.has(c.to) || shapeIds.has(c.to)))
        .map((c) => ({ ...c })),
    };
  }

  cutSelection() {
    this.copySelection();
    this.deleteSelection();
  }

  pasteClipboard() {
    if (!this._clipboard) return;
    const offset = GRID_SIZE;
    const idMap = new Map();
    const newSelection = [];

    for (const n of this._clipboard.nodes) {
      const newId = `node-${this.nextId++}`;
      this.nodes.set(newId, { ...n, id: newId, x: n.x + offset, y: n.y + offset });
      idMap.set(n.id, newId);
      newSelection.push({ type: "node", id: newId });
    }
    for (const s of this._clipboard.shapes) {
      const newId = `shape-${this.nextId++}`;
      this.shapes.set(newId, { ...s, id: newId, x: s.x + offset, y: s.y + offset });
      idMap.set(s.id, newId);
      newSelection.push({ type: "shape", id: newId });
    }
    for (const c of this._clipboard.connectors) {
      if (idMap.has(c.from) && idMap.has(c.to)) {
        const newId = `conn-${this.nextId++}`;
        this.connectors.set(newId, { ...c, id: newId, from: idMap.get(c.from), to: idMap.get(c.to) });
      }
    }
    if (newSelection.length === 0) return;
    this.setSelection(newSelection);
    this.render();
    this.pushHistory();
  }

  // ---------- Align / distribute (Phase 4) ----------

  alignSelection(edge) {
    const items = this.selectedBoxes();
    if (items.length < 2) return;
    const boxes = items.map((i) => i.box);
    switch (edge) {
      case "left": {
        const value = Math.min(...boxes.map((b) => b.x));
        boxes.forEach((b) => { b.x = value; });
        break;
      }
      case "right": {
        const value = Math.max(...boxes.map((b) => b.x + b.width));
        boxes.forEach((b) => { b.x = value - b.width; });
        break;
      }
      case "centerH": {
        const value = average(boxes.map((b) => b.x + b.width / 2));
        boxes.forEach((b) => { b.x = value - b.width / 2; });
        break;
      }
      case "top": {
        const value = Math.min(...boxes.map((b) => b.y));
        boxes.forEach((b) => { b.y = value; });
        break;
      }
      case "bottom": {
        const value = Math.max(...boxes.map((b) => b.y + b.height));
        boxes.forEach((b) => { b.y = value - b.height; });
        break;
      }
      case "middleV": {
        const value = average(boxes.map((b) => b.y + b.height / 2));
        boxes.forEach((b) => { b.y = value - b.height / 2; });
        break;
      }
      default:
        return;
    }
    this.render();
    this.pushHistory();
  }

  distributeSelection(axis) {
    const items = this.selectedBoxes();
    if (items.length < 3) return;
    const boxes = items.map((i) => i.box);
    if (axis === "horizontal") {
      boxes.sort((a, b) => a.x - b.x);
      const first = boxes[0];
      const last = boxes[boxes.length - 1];
      const totalWidth = boxes.reduce((sum, b) => sum + b.width, 0);
      const gap = ((last.x + last.width) - first.x - totalWidth) / (boxes.length - 1);
      let cursor = first.x;
      for (const b of boxes) {
        b.x = cursor;
        cursor += b.width + gap;
      }
    } else {
      boxes.sort((a, b) => a.y - b.y);
      const first = boxes[0];
      const last = boxes[boxes.length - 1];
      const totalHeight = boxes.reduce((sum, b) => sum + b.height, 0);
      const gap = ((last.y + last.height) - first.y - totalHeight) / (boxes.length - 1);
      let cursor = first.y;
      for (const b of boxes) {
        b.y = cursor;
        cursor += b.height + gap;
      }
    }
    this.render();
    this.pushHistory();
  }

  // ---------- Z-order (right-click context menu) ----------

  bringToFront(type, id) {
    const map = type === "node" ? this.nodes : this.shapes;
    const box = map.get(id);
    if (!box) return;
    map.delete(id);
    map.set(id, box);
    this.render();
    this.pushHistory();
  }

  sendToBack(type, id) {
    const map = type === "node" ? this.nodes : this.shapes;
    const box = map.get(id);
    if (!box) return;
    const entries = Array.from(map.entries()).filter(([k]) => k !== id);
    map.clear();
    map.set(id, box);
    for (const [k, v] of entries) map.set(k, v);
    this.render();
    this.pushHistory();
  }

  reverseConnector(id) {
    const conn = this.connectors.get(id);
    if (!conn) return;
    [conn.from, conn.to] = [conn.to, conn.from];
    this.render();
    this.pushHistory();
  }

  // ---------- Right-click context menu ----------

  onContextMenu(e, type, id) {
    e.preventDefault();
    e.stopPropagation();
    if (!this.isSelected(type, id)) this.selectOne(type, id);
    this.showContextMenu(e.clientX, e.clientY, type, id);
  }

  showContextMenu(clientX, clientY, type, id) {
    const items = [];
    if (type === "node" || type === "shape") {
      items.push({ label: "Duplicate", action: () => this.duplicateSelection() });
      items.push({ label: "Delete", action: () => this.deleteSelection() });
      items.push({ separator: true });
      items.push({ label: "Bring to Front", action: () => this.bringToFront(type, id) });
      items.push({ label: "Send to Back", action: () => this.sendToBack(type, id) });
    } else if (type === "connector") {
      items.push({ label: "Reverse Direction", action: () => this.reverseConnector(id) });
      items.push({ separator: true });
      items.push({ label: "Delete", action: () => this.deleteSelection() });
    } else {
      items.push({ label: "Delete", action: () => this.deleteSelection() });
    }

    const menu = this.els.contextMenu;
    menu.innerHTML = items
      .map((it) => (it.separator
        ? `<div class="context-menu-sep"></div>`
        : `<button type="button" class="context-menu-item">${escapeHtml(it.label)}</button>`))
      .join("");
    const buttons = menu.querySelectorAll(".context-menu-item");
    let bi = 0;
    for (const it of items) {
      if (it.separator) continue;
      const btn = buttons[bi++];
      btn.addEventListener("click", () => {
        it.action();
        this.hideContextMenu();
      });
    }

    menu.classList.remove("hidden");
    // Keep the menu on-screen if it was opened near the edge.
    const menuRect = menu.getBoundingClientRect();
    const maxLeft = window.innerWidth - menuRect.width - 8;
    const maxTop = window.innerHeight - menuRect.height - 8;
    menu.style.left = `${Math.min(clientX, maxLeft)}px`;
    menu.style.top = `${Math.min(clientY, maxTop)}px`;
  }

  hideContextMenu() {
    this.els.contextMenu.classList.add("hidden");
  }

  renderInspector() {
    const content = this.els.inspectorContent;
    if (this.selection.length === 0) {
      content.className = "inspector-empty";
      content.textContent = "Select a piece of equipment or a connector to see details here.";
      return;
    }

    if (this.selection.length > 1) {
      this.renderMultiInspector();
      return;
    }

    const activeSelection = this.selection[0];

    if (activeSelection.type === "node") {
      const node = this.nodes.get(activeSelection.id);
      if (!node) return;
      const spec = this.getEquipmentById(node.equipmentId);
      if (!spec) return;
      content.className = "";

      // Data note: this catalog's `model` field actually holds the brand
      // (e.g. "Terex Finlay") and `name` holds the specific model string
      // (e.g. "J-1175 Jaw Crusher") -- an artifact of the original
      // spreadsheet's Make/Model columns. Label them correctly here
      // rather than renaming the stored fields everywhere.
      const categoryLabel = this.categories.find((c) => c.id === spec.category)?.label || spec.category;
      const specsEntries = Object.entries(spec.specs || {});
      const weightEntry = specsEntries.find(([k]) => k.toLowerCase() === "weight");
      const otherSpecs = specsEntries.filter(([k]) => k.toLowerCase() !== "weight");

      const detailRows = [
        ["Make", spec.model || "—"],
        ["Model", spec.name],
        ["Category", categoryLabel],
        ["Weight", weightEntry ? weightEntry[1] : "Not specified"],
        ...otherSpecs,
      ]
        .map(([k, v]) => `<tr><td>${escapeHtml(k)}</td><td>${escapeHtml(String(v))}</td></tr>`)
        .join("");

      const actionBtns = `
        <div class="inspector-actions">
          ${spec.stockUrl
            ? `<a class="action-btn" href="${escapeAttr(spec.stockUrl)}" target="_blank" rel="noopener noreferrer">
                 <span class="action-btn-icon">&#128230;</span> Check Stock
               </a>`
            : `<button class="action-btn" disabled title="No stock link set for this item">
                 <span class="action-btn-icon">&#128230;</span> Check Stock
               </button>`}
          ${spec.brochureUrl
            ? `<a class="action-btn" href="${escapeAttr(spec.brochureUrl)}" target="_blank" rel="noopener noreferrer">
                 <span class="action-btn-icon">&#128196;</span> View Brochure
               </a>`
            : `<button class="action-btn" disabled title="No brochure link set for this item">
                 <span class="action-btn-icon">&#128196;</span> View Brochure
               </button>`}
        </div>`;

      content.innerHTML = `
        <div class="inspector-header">
          <span class="inspector-icon">${this.thumbHtml(spec)}</span>
          <div>
            <div class="inspector-name">${escapeHtml(spec.name)}</div>
            <div class="inspector-model">${escapeHtml(spec.model || "")}</div>
          </div>
        </div>
        <table class="inspector-specs">${detailRows}</table>
        ${actionBtns}
        <div class="inspector-position">Position: ${Math.round(node.x)}, ${Math.round(node.y)}</div>
        <label class="inspector-notes-label" for="inspector-notes">Notes</label>
        <textarea id="inspector-notes" rows="5" placeholder="Free-text notes for this item…">${escapeHtml(node.notes)}</textarea>
        <button id="inspector-delete" class="danger">Delete from canvas</button>
      `;
      const textarea = document.getElementById("inspector-notes");
      textarea.addEventListener("input", (e) => { node.notes = e.target.value; });
      textarea.addEventListener("blur", () => this.pushHistory());
      document.getElementById("inspector-delete").addEventListener("click", () => this.deleteSelection());
    } else if (activeSelection.type === "shape") {
      const shape = this.shapes.get(activeSelection.id);
      if (!shape) return;
      const kindLabel = { rect: "Rectangle", ellipse: "Ellipse", note: "Note", stockpile: "Stockpile" }[shape.kind] || "Shape";
      content.className = "";
      content.innerHTML = `
        <div class="inspector-header">
          <div>
            <div class="inspector-name">${kindLabel}</div>
          </div>
        </div>
        <label class="inspector-notes-label" for="inspector-notes">Text</label>
        <textarea id="inspector-notes" rows="4" placeholder="Label for this ${kindLabel.toLowerCase()}…">${escapeHtml(shape.text || "")}</textarea>
        <button id="inspector-delete" class="danger">Delete from canvas</button>
      `;
      const textarea = document.getElementById("inspector-notes");
      textarea.addEventListener("input", (e) => {
        shape.text = e.target.value;
        const el = this.els.world.querySelector(`.shape[data-id="${shape.id}"] .shape-text`);
        if (el) el.textContent = shape.text;
      });
      textarea.addEventListener("blur", () => this.pushHistory());
      document.getElementById("inspector-delete").addEventListener("click", () => this.deleteSelection());
    } else if (activeSelection.type === "line") {
      content.className = "";
      content.innerHTML = `
        <div class="inspector-header">
          <div>
            <div class="inspector-name">Line</div>
            <div class="inspector-model">Freeform annotation, not tied to equipment</div>
          </div>
        </div>
        <button id="inspector-delete" class="danger">Delete line</button>
      `;
      document.getElementById("inspector-delete").addEventListener("click", () => this.deleteSelection());
    } else {
      const conn = this.connectors.get(activeSelection.id);
      if (!conn) return;
      content.className = "";
      content.innerHTML = `
        <div class="inspector-header">
          <div>
            <div class="inspector-name">Connector</div>
            <div class="inspector-model">${escapeHtml(this.boxLabel(conn.from))} &rarr; ${escapeHtml(this.boxLabel(conn.to))}</div>
          </div>
        </div>
        <button id="inspector-reverse" class="inspector-secondary-btn">Reverse direction</button>
        <button id="inspector-delete" class="danger">Delete connector</button>
      `;
      document.getElementById("inspector-reverse").addEventListener("click", () => this.reverseConnector(conn.id));
      document.getElementById("inspector-delete").addEventListener("click", () => this.deleteSelection());
    }
  }

  // Two or more objects selected: a summary plus the align/distribute
  // panel (draw.io keeps these controls contextual rather than permanent
  // toolbar real estate, so they only appear once there's something to
  // act on).
  renderMultiInspector() {
    const content = this.els.inspectorContent;
    const boxItems = this.selectedBoxes();
    const otherCount = this.selection.length - boxItems.length;
    content.className = "";
    content.innerHTML = `
      <div class="inspector-name">${this.selection.length} objects selected</div>
      <div class="inspector-multi-hint">
        ${boxItems.length} equipment/shape${boxItems.length === 1 ? "" : "s"}${otherCount > 0 ? `, ${otherCount} connector/line${otherCount === 1 ? "" : "s"}` : ""}
      </div>
      <div class="align-toolbar">
        <div class="align-toolbar-label">Align</div>
        <div class="align-toolbar-row">
          <button type="button" data-align="left" ${boxItems.length < 2 ? "disabled" : ""}>Left</button>
          <button type="button" data-align="centerH" ${boxItems.length < 2 ? "disabled" : ""}>Center</button>
          <button type="button" data-align="right" ${boxItems.length < 2 ? "disabled" : ""}>Right</button>
          <button type="button" data-align="top" ${boxItems.length < 2 ? "disabled" : ""}>Top</button>
          <button type="button" data-align="middleV" ${boxItems.length < 2 ? "disabled" : ""}>Middle</button>
          <button type="button" data-align="bottom" ${boxItems.length < 2 ? "disabled" : ""}>Bottom</button>
        </div>
        <div class="align-toolbar-label">Distribute</div>
        <div class="align-toolbar-row align-toolbar-row-2">
          <button type="button" data-distribute="horizontal" ${boxItems.length < 3 ? "disabled" : ""}>Horizontal</button>
          <button type="button" data-distribute="vertical" ${boxItems.length < 3 ? "disabled" : ""}>Vertical</button>
        </div>
      </div>
      <button id="inspector-duplicate" class="inspector-secondary-btn">Duplicate (Ctrl+D)</button>
      <button id="inspector-delete" class="danger">Delete selection</button>
    `;
    for (const btn of content.querySelectorAll("[data-align]")) {
      btn.addEventListener("click", () => this.alignSelection(btn.dataset.align));
    }
    for (const btn of content.querySelectorAll("[data-distribute]")) {
      btn.addEventListener("click", () => this.distributeSelection(btn.dataset.distribute));
    }
    document.getElementById("inspector-duplicate").addEventListener("click", () => this.duplicateSelection());
    document.getElementById("inspector-delete").addEventListener("click", () => this.deleteSelection());
  }

  renderSelectionHighlight() {
    for (const el of this.els.world.querySelectorAll(".node")) {
      el.classList.toggle("selected", this.isSelected("node", el.dataset.id));
    }
    for (const el of this.els.world.querySelectorAll(".shape")) {
      el.classList.toggle("selected", this.isSelected("shape", el.dataset.id));
    }
    for (const el of this.els.svg.querySelectorAll(".connector-line:not(.free-line)")) {
      el.classList.toggle("selected", this.isSelected("connector", el.dataset.id));
    }
    for (const el of this.els.svg.querySelectorAll(".free-line")) {
      el.classList.toggle("selected", this.isSelected("line", el.dataset.id));
    }
  }

  // ---------- Rendering ----------

  render() {
    this.renderNodes();
    this.renderShapes();
    this.renderConnectors();
    this.renderInspector();
    this.els.emptyHint.style.display =
      this.nodes.size === 0 && this.shapes.size === 0 && this.lines.size === 0 ? "block" : "none";
  }

  renderNodes() {
    for (const el of Array.from(this.els.world.querySelectorAll(".node"))) el.remove();

    for (const node of this.nodes.values()) {
      const spec = this.getEquipmentById(node.equipmentId);
      const el = document.createElement("div");
      el.className = "node";
      el.dataset.id = node.id;
      el.style.left = `${node.x}px`;
      el.style.top = `${node.y}px`;
      el.style.width = `${node.width}px`;
      el.style.height = `${node.height}px`;
      const tickColor = spec ? colorForCategory(spec.category) : "#999";
      el.innerHTML = `
        <div class="node-icon">${spec ? this.thumbHtml(spec) : ""}</div>
        <div class="node-label">
          <div class="node-category-tick" style="background:${tickColor}"></div>
          <div class="node-name">${spec ? escapeHtml(spec.name) : "Unknown equipment"}</div>
          <div class="node-model">${spec ? escapeHtml(spec.model || "") : ""}</div>
        </div>
        ${connectDotsHtml()}
        <div class="resize-handle"></div>
      `;

      el.addEventListener("mousedown", (e) => this.startBoxDrag(e, "node", node));
      el.addEventListener("contextmenu", (e) => this.onContextMenu(e, "node", node.id));
      for (const dot of el.querySelectorAll(".connect-dot")) {
        dot.addEventListener("mousedown", (e) => this.onConnectDotMouseDown(e, node));
      }
      el.querySelector(".resize-handle").addEventListener("mousedown", (e) => this.onResizeMouseDown(e, node));

      this.els.world.appendChild(el);
    }
    this.renderSelectionHighlight();
  }

  // Shared drag handler for both equipment nodes and Tools-panel shapes --
  // both are {id,x,y,width,height} boxes, so one implementation covers
  // single-item drag, group drag (when the clicked box is already part of
  // a multi-selection, every selected box moves by the same delta so
  // relative positions and connections are preserved), shift-click
  // toggling, and live alignment-guide snapping against every other box.
  startBoxDrag(e, type, box) {
    // Space-held or middle-mouse means the user wants to pan, even if the
    // gesture starts on top of a node/shape -- let it bubble to the
    // canvas-level pan handler instead of moving the equipment.
    if (this.spaceHeld || e.button !== 0) return;
    e.stopPropagation();

    if (e.shiftKey) {
      this.toggleSelection(type, box.id);
      return;
    }
    if (!this.isSelected(type, box.id)) {
      this.selectOne(type, box.id);
    }
    // else: box is already part of the current multi-selection -- keep it
    // and drag the whole group together.

    const group = this.selection
      .map((sel) => ({ sel, box: this.getBox(sel.id) }))
      .filter((g) => g.box);
    const starts = new Map(group.map((g) => [g.sel.id, { x: g.box.x, y: g.box.y }]));
    const otherBoxes = [...this.nodes.values(), ...this.shapes.values()].filter(
      (b) => !group.some((g) => g.box.id === b.id)
    );

    const startX = e.clientX;
    const startY = e.clientY;
    const primaryStart = starts.get(box.id);
    let moved = false;

    const onMove = (ev) => {
      const dxRaw = (ev.clientX - startX) / this.view.scale;
      const dyRaw = (ev.clientY - startY) / this.view.scale;
      if (Math.abs(dxRaw) > 2 || Math.abs(dyRaw) > 2) moved = true;

      const rawX = primaryStart.x + dxRaw;
      const rawY = primaryStart.y + dyRaw;
      let snappedX = ev.altKey ? rawX : snapToGrid(rawX);
      let snappedY = ev.altKey ? rawY : snapToGrid(rawY);

      this.clearAlignGuides();
      if (!ev.altKey) {
        const preview = { ...box, x: rawX, y: rawY };
        const snap = this.computeAlignSnap(preview, otherBoxes);
        if (snap.x !== null) snappedX = snap.x;
        if (snap.y !== null) snappedY = snap.y;
        this.renderAlignGuides(snap.guides);
      }

      const finalDx = snappedX - primaryStart.x;
      const finalDy = snappedY - primaryStart.y;

      for (const g of group) {
        const s = starts.get(g.sel.id);
        g.box.x = s.x + finalDx;
        g.box.y = s.y + finalDy;
        const el = this.els.world.querySelector(`[data-id="${g.box.id}"]`);
        if (el) {
          el.style.left = `${g.box.x}px`;
          el.style.top = `${g.box.y}px`;
        }
      }
      this.renderConnectors();
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      this.clearAlignGuides();
      if (moved) {
        this.renderConnectors();
        this.pushHistory();
      }
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  // ---------- Alignment guides (snap dragged box to nearby box edges/centers) ----------

  computeAlignSnap(movingBox, otherBoxes) {
    const threshold = 6 / this.view.scale;
    const mLeft = movingBox.x;
    const mRight = movingBox.x + movingBox.width;
    const mCenterX = movingBox.x + movingBox.width / 2;
    const mTop = movingBox.y;
    const mBottom = movingBox.y + movingBox.height;
    const mCenterY = movingBox.y + movingBox.height / 2;

    let bestXDist = threshold;
    let bestX = null;
    let guideX = null;
    let bestYDist = threshold;
    let bestY = null;
    let guideY = null;

    for (const other of otherBoxes) {
      const oLeft = other.x;
      const oRight = other.x + other.width;
      const oCenterX = other.x + other.width / 2;
      const oTop = other.y;
      const oBottom = other.y + other.height;
      const oCenterY = other.y + other.height / 2;

      const xCandidates = [
        [mLeft, oLeft, oLeft],
        [mLeft, oRight, oRight],
        [mRight, oLeft, oLeft - movingBox.width],
        [mRight, oRight, oRight - movingBox.width],
        [mCenterX, oCenterX, oCenterX - movingBox.width / 2],
      ];
      for (const [mVal, guideVal, snapped] of xCandidates) {
        const d = Math.abs(mVal - guideVal);
        if (d < bestXDist) { bestXDist = d; bestX = snapped; guideX = guideVal; }
      }

      const yCandidates = [
        [mTop, oTop, oTop],
        [mTop, oBottom, oBottom],
        [mBottom, oTop, oTop - movingBox.height],
        [mBottom, oBottom, oBottom - movingBox.height],
        [mCenterY, oCenterY, oCenterY - movingBox.height / 2],
      ];
      for (const [mVal, guideVal, snapped] of yCandidates) {
        const d = Math.abs(mVal - guideVal);
        if (d < bestYDist) { bestYDist = d; bestY = snapped; guideY = guideVal; }
      }
    }

    const guides = [];
    if (guideX !== null) guides.push({ type: "v", x: guideX });
    if (guideY !== null) guides.push({ type: "h", y: guideY });
    return { x: bestX, y: bestY, guides };
  }

  renderAlignGuides(guides) {
    this.clearAlignGuides();
    const svgNS = "http://www.w3.org/2000/svg";
    for (const g of guides) {
      const line = document.createElementNS(svgNS, "line");
      line.setAttribute("class", "align-guide");
      if (g.type === "v") {
        line.setAttribute("x1", g.x);
        line.setAttribute("x2", g.x);
        line.setAttribute("y1", -5000);
        line.setAttribute("y2", 5000);
      } else {
        line.setAttribute("y1", g.y);
        line.setAttribute("y2", g.y);
        line.setAttribute("x1", -5000);
        line.setAttribute("x2", 5000);
      }
      this.els.guideLayer.appendChild(line);
    }
  }

  clearAlignGuides() {
    this.els.guideLayer.innerHTML = "";
  }

  onResizeMouseDown(e, node) {
    e.stopPropagation();
    e.preventDefault();

    const startX = e.clientX;
    const startY = e.clientY;
    const start = { x: node.x, y: node.y, width: node.width, height: node.height };
    const el = this.els.world.querySelector(`.node[data-id="${node.id}"]`);

    const onMove = (ev) => {
      const dx = (ev.clientX - startX) / this.view.scale;
      const dy = (ev.clientY - startY) / this.view.scale;
      const rawW = clamp(start.width + dx, MIN_NODE_WIDTH, MAX_NODE_WIDTH);
      const rawH = clamp(start.height + dy, MIN_NODE_HEIGHT, MAX_NODE_HEIGHT);
      node.width = ev.altKey ? rawW : snapToGrid(rawW);
      node.height = ev.altKey ? rawH : snapToGrid(rawH);
      if (el) {
        el.style.width = `${node.width}px`;
        el.style.height = `${node.height}px`;
      }
      this.renderConnectors();
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      this.pushHistory();
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  // ---------- Connectors (drag from a node's connection dots, draw.io-style) ----------

  onConnectDotMouseDown(e, sourceNode) {
    e.stopPropagation();
    e.preventDefault();

    const tempLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
    tempLine.setAttribute("class", "connector-line connector-line-temp");
    this.els.svg.appendChild(tempLine);

    let targetNode = null;

    const onMove = (ev) => {
      const { x, y } = this.clientToWorld(ev.clientX, ev.clientY);
      const start = this.nodeCenter(sourceNode);
      tempLine.setAttribute("x1", start.x);
      tempLine.setAttribute("y1", start.y);
      tempLine.setAttribute("x2", x);
      tempLine.setAttribute("y2", y);

      const hovered = this.nodeAtPoint(x, y, sourceNode.id);
      if (hovered !== targetNode) {
        if (targetNode) this.setNodeHoverState(targetNode, false);
        targetNode = hovered;
        if (targetNode) this.setNodeHoverState(targetNode, true);
      }
    };

    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      tempLine.remove();
      if (targetNode) {
        this.setNodeHoverState(targetNode, false);
        this.addConnector(sourceNode.id, targetNode.id);
      }
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  cancelConnectDrag() {
    for (const el of this.els.svg.querySelectorAll(".connector-line-temp")) el.remove();
  }

  setNodeHoverState(box, isTarget) {
    const el = this.els.world.querySelector(`.node[data-id="${box.id}"], .shape[data-id="${box.id}"]`);
    if (el) el.classList.toggle("connect-target", isTarget);
  }

  nodeAtPoint(worldX, worldY, excludeId, margin = 0) {
    for (const box of [...this.nodes.values(), ...this.shapes.values()]) {
      if (box.id === excludeId) continue;
      if (
        worldX >= box.x - margin && worldX <= box.x + box.width + margin &&
        worldY >= box.y - margin && worldY <= box.y + box.height + margin
      ) {
        return box;
      }
    }
    return null;
  }

  addConnector(fromId, toId) {
    if (fromId === toId) return;
    const exists = Array.from(this.connectors.values()).some(
      (c) => (c.from === fromId && c.to === toId) || (c.from === toId && c.to === fromId)
    );
    if (exists) return;
    const id = `conn-${this.nextId++}`;
    this.connectors.set(id, {
      id,
      from: fromId,
      to: toId,
      style: { arrowStart: false, arrowEnd: true, lineType: "solid" },
    });
    this.selectOne("connector", id);
    this.render();
    this.pushHistory();
  }

  nodeCenter(node) {
    return { x: node.x + node.width / 2, y: node.y + node.height / 2 };
  }

  // ---------- Orthogonal connector routing ----------
  //
  // "Auto" routing (the only mode implemented so far -- manual waypoint
  // editing is a follow-up pass): pick the exit/entry side on each box
  // from the sign of dx/dy between their centers, then connect those two
  // anchor points with a Manhattan path -- a straight run when the anchors
  // already line up, otherwise a single Z-bend through the midpoint. This
  // is recomputed from current box positions on every render, so moving
  // either end reroutes automatically without any stored path to go stale.

  anchorPoint(box, side) {
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    switch (side) {
      case "n": return { x: cx, y: box.y };
      case "s": return { x: cx, y: box.y + box.height };
      case "e": return { x: box.x + box.width, y: cy };
      default: return { x: box.x, y: cy };
    }
  }

  computeOrthogonalPath(a, b) {
    const aCenter = this.nodeCenter(a);
    const bCenter = this.nodeCenter(b);
    const dx = bCenter.x - aCenter.x;
    const dy = bCenter.y - aCenter.y;
    const horizontal = Math.abs(dx) >= Math.abs(dy);

    const aSide = horizontal ? (dx >= 0 ? "e" : "w") : (dy >= 0 ? "s" : "n");
    const bSide = horizontal ? (dx >= 0 ? "w" : "e") : (dy >= 0 ? "n" : "s");
    const p1 = this.anchorPoint(a, aSide);
    const p2 = this.anchorPoint(b, bSide);

    if (horizontal) {
      if (Math.abs(p1.y - p2.y) < 0.5) return [p1, p2];
      const midX = (p1.x + p2.x) / 2;
      return [p1, { x: midX, y: p1.y }, { x: midX, y: p2.y }, p2];
    }
    if (Math.abs(p1.x - p2.x) < 0.5) return [p1, p2];
    const midY = (p1.y + p2.y) / 2;
    return [p1, { x: p1.x, y: midY }, { x: p2.x, y: midY }, p2];
  }

  // Renders a polyline as an SVG path with small rounded corners at each
  // interior bend (draw.io-style), rather than sharp right angles.
  pointsToRoundedPath(points, radius = 7) {
    if (points.length < 2) return "";
    if (points.length === 2) return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;

    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length - 1; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const next = points[i + 1];
      const len1 = Math.hypot(curr.x - prev.x, curr.y - prev.y);
      const len2 = Math.hypot(next.x - curr.x, next.y - curr.y);
      const r = Math.min(radius, len1 / 2, len2 / 2);
      const inX = len1 > 0 ? curr.x - ((curr.x - prev.x) / len1) * r : curr.x;
      const inY = len1 > 0 ? curr.y - ((curr.y - prev.y) / len1) * r : curr.y;
      const outX = len2 > 0 ? curr.x + ((next.x - curr.x) / len2) * r : curr.x;
      const outY = len2 > 0 ? curr.y + ((next.y - curr.y) / len2) * r : curr.y;
      d += ` L ${inX} ${inY} Q ${curr.x} ${curr.y} ${outX} ${outY}`;
    }
    const last = points[points.length - 1];
    d += ` L ${last.x} ${last.y}`;
    return d;
  }

  renderConnectors() {
    const svg = this.els.svg;
    svg.innerHTML = `
      <defs>
        <marker id="arrowhead" markerWidth="10" markerHeight="10" refX="8" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8 Z" fill="#374151"/>
        </marker>
        <marker id="arrowhead-start" markerWidth="10" markerHeight="10" refX="2" refY="4" orient="auto">
          <path d="M8,0 L0,4 L8,8 Z" fill="#374151"/>
        </marker>
      </defs>`;

    for (const conn of this.connectors.values()) {
      const from = this.getBox(conn.from);
      const to = this.getBox(conn.to);
      if (!from || !to) continue;

      const points = this.computeOrthogonalPath(from, to);
      const style = conn.style || { arrowEnd: true };

      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", this.pointsToRoundedPath(points));
      path.setAttribute("class", "connector-line");
      if (style.arrowEnd !== false) path.setAttribute("marker-end", "url(#arrowhead)");
      if (style.arrowStart) path.setAttribute("marker-start", "url(#arrowhead-start)");
      if (style.lineType === "dashed") path.setAttribute("stroke-dasharray", "8 5");
      path.dataset.id = conn.id;
      path.addEventListener("mousedown", (e) => {
        e.stopPropagation();
        if (e.shiftKey) this.toggleSelection("connector", conn.id);
        else this.selectOne("connector", conn.id);
      });
      path.addEventListener("contextmenu", (e) => this.onContextMenu(e, "connector", conn.id));
      svg.appendChild(path);
    }
    this.renderFreeLines();
    this.renderSelectionHighlight();
  }

  // Kept for the freeform Line tool's magnet-snap (it targets whichever
  // side of a node/shape is closest to the dragged endpoint, independent
  // of the orthogonal auto-routing above).
  nodeAnchor(node, towardsNode) {
    const { x: cx, y: cy } = this.nodeCenter(node);
    const { x: tcx, y: tcy } = this.nodeCenter(towardsNode);
    const dx = tcx - cx;
    const dy = tcy - cy;
    const angle = Math.atan2(dy, dx);
    const halfW = node.width / 2;
    const halfH = node.height / 2;
    const scale = Math.min(
      Math.abs(halfW / Math.cos(angle) || Infinity),
      Math.abs(halfH / Math.sin(angle) || Infinity)
    );
    return { x: cx + Math.cos(angle) * scale, y: cy + Math.sin(angle) * scale };
  }

  // ---------- Shapes & free lines (drawio-style annotation tools) ----------
  //
  // Independent of equipment: rectangles/ellipses/notes are generic boxes a
  // rep can label freely, and lines are plain two-point arrows not anchored
  // to any node. Both participate in selection/undo/export like everything
  // else on the canvas.

  addShape(kind, x, y) {
    const size = SHAPE_DEFAULTS[kind] || SHAPE_DEFAULTS.rect;
    const id = `shape-${this.nextId++}`;
    this.shapes.set(id, {
      id,
      kind,
      x: snapToGrid(x - size.width / 2),
      y: snapToGrid(y - size.height / 2),
      width: size.width,
      height: size.height,
      text: kind === "note" ? "Note" : "",
    });
    this.selectOne("shape", id);
    this.render();
    this.pushHistory();
    return id;
  }

  deleteShape(id) {
    this.shapes.delete(id);
    this.removeConnectorsFor(id);
  }

  addLine(x, y) {
    const id = `line-${this.nextId++}`;
    this.lines.set(id, {
      id,
      x1: snapToGrid(x - LINE_DEFAULT_LENGTH / 2),
      y1: snapToGrid(y),
      x2: snapToGrid(x + LINE_DEFAULT_LENGTH / 2),
      y2: snapToGrid(y),
    });
    this.selectOne("line", id);
    this.render();
    this.pushHistory();
    return id;
  }

  deleteLine(id) {
    this.lines.delete(id);
  }

  renderShapes() {
    for (const el of Array.from(this.els.world.querySelectorAll(".shape"))) el.remove();

    for (const shape of this.shapes.values()) {
      const el = document.createElement("div");
      el.className = `shape shape-${shape.kind}`;
      el.dataset.id = shape.id;
      el.style.left = `${shape.x}px`;
      el.style.top = `${shape.y}px`;
      el.style.width = `${shape.width}px`;
      el.style.height = `${shape.height}px`;
      const body = shape.kind === "stockpile"
        ? `<div class="shape-stockpile-icon">${iconSvg("stockpile", "stockpiling")}</div>
           <div class="shape-text shape-text-under">${escapeHtml(shape.text || "")}</div>`
        : `<div class="shape-text">${escapeHtml(shape.text || "")}</div>`;
      el.innerHTML = `
        ${body}
        ${connectDotsHtml()}
        <div class="resize-handle"></div>
      `;
      el.addEventListener("mousedown", (e) => this.startBoxDrag(e, "shape", shape));
      el.addEventListener("contextmenu", (e) => this.onContextMenu(e, "shape", shape.id));
      for (const dot of el.querySelectorAll(".connect-dot")) {
        dot.addEventListener("mousedown", (e) => this.onConnectDotMouseDown(e, shape));
      }
      el.querySelector(".resize-handle").addEventListener("mousedown", (e) => this.onShapeResizeMouseDown(e, shape));
      this.els.world.appendChild(el);
    }
    this.renderSelectionHighlight();
  }

  onShapeResizeMouseDown(e, shape) {
    e.stopPropagation();
    e.preventDefault();

    const startX = e.clientX;
    const startY = e.clientY;
    const start = { width: shape.width, height: shape.height };
    const el = this.els.world.querySelector(`.shape[data-id="${shape.id}"]`);

    const onMove = (ev) => {
      const dx = (ev.clientX - startX) / this.view.scale;
      const dy = (ev.clientY - startY) / this.view.scale;
      const rawW = clamp(start.width + dx, MIN_SHAPE_SIZE, MAX_SHAPE_SIZE);
      const rawH = clamp(start.height + dy, MIN_SHAPE_SIZE, MAX_SHAPE_SIZE);
      shape.width = ev.altKey ? rawW : snapToGrid(rawW);
      shape.height = ev.altKey ? rawH : snapToGrid(rawH);
      if (el) {
        el.style.width = `${shape.width}px`;
        el.style.height = `${shape.height}px`;
      }
      this.renderConnectors();
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      this.pushHistory();
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  renderFreeLines() {
    const svg = this.els.svg;
    for (const line of this.lines.values()) {
      const el = document.createElementNS("http://www.w3.org/2000/svg", "line");
      el.setAttribute("x1", line.x1);
      el.setAttribute("y1", line.y1);
      el.setAttribute("x2", line.x2);
      el.setAttribute("y2", line.y2);
      el.setAttribute("class", "connector-line free-line");
      el.setAttribute("marker-end", "url(#arrowhead)");
      el.dataset.id = line.id;
      el.addEventListener("mousedown", (e) => {
        e.stopPropagation();
        if (e.shiftKey) this.toggleSelection("line", line.id);
        else this.selectOne("line", line.id);
      });
      el.addEventListener("contextmenu", (e) => this.onContextMenu(e, "line", line.id));
      svg.appendChild(el);

      if (this.selection.length === 1 && this.selection[0].type === "line" && this.selection[0].id === line.id) {
        svg.appendChild(this.buildLineHandle(line, "1"));
        svg.appendChild(this.buildLineHandle(line, "2"));
      }
    }
  }

  buildLineHandle(line, endKey) {
    const handle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    handle.setAttribute("cx", line[`x${endKey}`]);
    handle.setAttribute("cy", line[`y${endKey}`]);
    handle.setAttribute("r", 5);
    handle.setAttribute("class", "line-handle");
    handle.addEventListener("mousedown", (e) => this.onLineHandleMouseDown(e, line, endKey));
    return handle;
  }

  onLineHandleMouseDown(e, line, endKey) {
    e.stopPropagation();
    e.preventDefault();
    this.selectOne("line", line.id);
    const otherKey = endKey === "1" ? "2" : "1";

    let magnetTarget = null;

    const onMove = (ev) => {
      const { x, y } = this.clientToWorld(ev.clientX, ev.clientY);
      const hovered = ev.altKey ? null : this.nodeAtPoint(x, y, null, MAGNET_RADIUS);
      if (hovered !== magnetTarget) {
        if (magnetTarget) this.setNodeHoverState(magnetTarget, false);
        magnetTarget = hovered;
        if (magnetTarget) this.setNodeHoverState(magnetTarget, true);
      }

      if (magnetTarget) {
        const other = { x: line[`x${otherKey}`], y: line[`y${otherKey}`], width: 0, height: 0 };
        const anchor = this.nodeAnchor(magnetTarget, other);
        line[`x${endKey}`] = anchor.x;
        line[`y${endKey}`] = anchor.y;
      } else {
        line[`x${endKey}`] = ev.altKey ? x : snapToGrid(x);
        line[`y${endKey}`] = ev.altKey ? y : snapToGrid(y);
      }
      this.renderConnectors();
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      if (magnetTarget) this.setNodeHoverState(magnetTarget, false);
      this.pushHistory();
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  // ---------- Undo / redo ----------
  //
  // this.history[this.historyIndex] is always the current state. pushHistory()
  // is called after every discrete mutation (so it records the post-change
  // state); undo/redo just walk the index up and down that array.

  snapshot() {
    return {
      nodes: Array.from(this.nodes.values()).map((n) => ({ ...n })),
      connectors: Array.from(this.connectors.values()).map((c) => ({ ...c })),
      shapes: Array.from(this.shapes.values()).map((s) => ({ ...s })),
      lines: Array.from(this.lines.values()).map((l) => ({ ...l })),
    };
  }

  resetHistory() {
    this.history = [this.snapshot()];
    this.historyIndex = 0;
    this.updateHistoryButtons();
  }

  pushHistory() {
    this.history = this.history.slice(0, this.historyIndex + 1);
    this.history.push(this.snapshot());
    this.historyIndex++;
    if (this.history.length > MAX_HISTORY) {
      this.history.shift();
      this.historyIndex--;
    }
    this.updateHistoryButtons();
  }

  restoreSnapshot(snap) {
    this.nodes = new Map(snap.nodes.map((n) => [n.id, { ...n }]));
    this.connectors = new Map(snap.connectors.map((c) => [c.id, { ...c }]));
    this.shapes = new Map((snap.shapes || []).map((s) => [s.id, { ...s }]));
    this.lines = new Map((snap.lines || []).map((l) => [l.id, { ...l }]));
    this.selection = [];
    this.render();
    this.updateHistoryButtons();
  }

  undo() {
    if (this.historyIndex <= 0) return;
    this.historyIndex--;
    this.restoreSnapshot(this.history[this.historyIndex]);
  }

  redo() {
    if (this.historyIndex >= this.history.length - 1) return;
    this.historyIndex++;
    this.restoreSnapshot(this.history[this.historyIndex]);
  }

  updateHistoryButtons() {
    document.getElementById("btn-undo").disabled = this.historyIndex <= 0;
    document.getElementById("btn-redo").disabled = this.historyIndex >= this.history.length - 1;
  }

  // ---------- Save / Load ----------

  newLayout() {
    const hasContent = this.nodes.size > 0 || this.shapes.size > 0 || this.lines.size > 0;
    if (hasContent && !confirm("Clear the current layout? Unsaved changes will be lost.")) return;
    this.nodes.clear();
    this.connectors.clear();
    this.shapes.clear();
    this.lines.clear();
    this.currentLayoutId = null;
    this.setSelection([]);
    this.resetView();
    this.render();
    this.resetHistory();
  }

  promptSave() {
    this.openModal("Save Layout", "Save", (name) => {
      if (!name) return;
      this.currentLayoutId = saveLayout(name, {
        id: this.currentLayoutId,
        nodes: Array.from(this.nodes.values()),
        connectors: Array.from(this.connectors.values()),
        shapes: Array.from(this.shapes.values()),
        lines: Array.from(this.lines.values()),
      });
      this.refreshLayoutList();
    });
  }

  loadSelected() {
    const id = this.els.loadSelect.value;
    if (!id) return;
    const layout = loadLayout(id);
    if (!layout) return;

    this.nodes.clear();
    this.connectors.clear();
    this.shapes.clear();
    this.lines.clear();
    for (const n of layout.nodes) {
      this.nodes.set(n.id, {
        width: DEFAULT_NODE_WIDTH,
        height: DEFAULT_NODE_HEIGHT,
        ...n,
      });
    }
    for (const c of layout.connectors) {
      this.connectors.set(c.id, { style: { arrowStart: false, arrowEnd: true, lineType: "solid" }, ...c });
    }
    for (const s of layout.shapes || []) this.shapes.set(s.id, s);
    for (const l of layout.lines || []) this.lines.set(l.id, l);
    this.currentLayoutId = layout.id;
    this.setSelection([]);
    this.render();
    this.resetHistory();
  }

  deleteSelected() {
    const id = this.els.loadSelect.value;
    if (!id) return;
    if (!confirm("Delete this saved layout? This cannot be undone.")) return;
    deleteLayout(id);
    if (this.currentLayoutId === id) this.currentLayoutId = null;
    this.refreshLayoutList();
  }

  refreshLayoutList() {
    const select = this.els.loadSelect;
    select.innerHTML = '<option value="">Saved layouts…</option>';
    for (const layout of listLayouts()) {
      const opt = document.createElement("option");
      opt.value = layout.id;
      opt.textContent = layout.name;
      select.appendChild(opt);
    }
  }

  // ---------- Modal (used for save-name prompt) ----------

  openModal(title, confirmLabel, onConfirm) {
    this.els.modalTitle.textContent = title;
    document.getElementById("modal-confirm").textContent = confirmLabel;
    this.els.modalInput.value = "";
    this.els.modalBackdrop.classList.remove("hidden");
    this.els.modalInput.focus();
    this._modalOnConfirm = onConfirm;
  }

  closeModal() {
    this.els.modalBackdrop.classList.add("hidden");
    this._modalOnConfirm = null;
  }

  confirmModal() {
    const value = this.els.modalInput.value.trim();
    const cb = this._modalOnConfirm;
    this.closeModal();
    if (cb) cb(value);
  }

  // ---------- Export ----------

  async exportPng() {
    if (this.nodes.size === 0 && this.shapes.size === 0 && this.lines.size === 0) {
      alert("Add some equipment or drawing elements to the canvas before exporting.");
      return;
    }

    const bounds = this.computeNodeBounds();
    const exportRoot = this.buildExportDom(bounds);
    document.body.appendChild(exportRoot);

    try {
      const canvas = await html2canvas(exportRoot, { backgroundColor: "#ffffff", scale: 2 });
      const link = document.createElement("a");
      link.download = `plant-layout-${Date.now()}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } finally {
      exportRoot.remove();
    }
  }

  computeNodeBounds() {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const grow = (x, y) => {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    };
    for (const node of this.nodes.values()) {
      grow(node.x, node.y);
      grow(node.x + node.width, node.y + node.height);
    }
    for (const shape of this.shapes.values()) {
      grow(shape.x, shape.y);
      grow(shape.x + shape.width, shape.y + shape.height);
    }
    for (const line of this.lines.values()) {
      grow(line.x1, line.y1);
      grow(line.x2, line.y2);
    }
    const pad = 40;
    return { minX: minX - pad, minY: minY - pad, width: maxX - minX + pad * 2, height: maxY - minY + pad * 2 };
  }

  buildExportDom(bounds) {
    const wrapper = document.createElement("div");
    wrapper.className = "export-wrapper";
    wrapper.style.position = "fixed";
    wrapper.style.left = "-99999px";
    wrapper.style.top = "0";

    const header = document.createElement("div");
    header.className = "export-header";
    header.innerHTML = `
      <div class="export-brand-mark">OPS</div>
      <div>
        <div class="export-brand-name">OPS Group</div>
        <div class="export-brand-tagline">Proposed Plant Layout</div>
      </div>
      <div class="export-date">${new Date().toLocaleDateString()}</div>
    `;

    const canvasClone = document.createElement("div");
    canvasClone.className = "export-canvas";
    canvasClone.style.width = `${bounds.width}px`;
    canvasClone.style.height = `${bounds.height}px`;

    const inner = document.createElement("div");
    inner.style.transform = `translate(${-bounds.minX}px, ${-bounds.minY}px)`;
    const worldClone = this.els.world.cloneNode(true);
    worldClone.style.transform = "none";
    for (const dot of worldClone.querySelectorAll(".connect-dot, .resize-handle, .line-handle")) dot.remove();
    inner.appendChild(worldClone);
    canvasClone.appendChild(inner);

    const bom = this.buildBomTable();

    const footer = document.createElement("div");
    footer.className = "export-footer";
    footer.textContent = "For presentation purposes only. Not an engineering drawing.";

    wrapper.appendChild(header);
    wrapper.appendChild(canvasClone);
    wrapper.appendChild(bom);
    wrapper.appendChild(footer);
    return wrapper;
  }

  buildBomTable() {
    const container = document.createElement("div");
    container.className = "export-bom";

    const title = document.createElement("h4");
    title.textContent = "Equipment List";
    container.appendChild(title);

    const table = document.createElement("table");
    const rows = Array.from(this.nodes.values()).map((node) => {
      const spec = this.getEquipmentById(node.equipmentId);
      return `<tr><td>${escapeHtml(spec?.name || "Unknown")}</td><td>${escapeHtml(spec?.model || "")}</td><td>${escapeHtml(node.notes || "")}</td></tr>`;
    });
    table.innerHTML = `
      <thead><tr><th>Equipment</th><th>Model</th><th>Notes</th></tr></thead>
      <tbody>${rows.join("")}</tbody>`;
    container.appendChild(table);
    return container;
  }
}

function connectDotsHtml() {
  const arrows = { n: "&#8593;", e: "&#8594;", s: "&#8595;", w: "&#8592;" };
  return Object.entries(arrows)
    .map(([side, glyph]) => `<div class="connect-dot connect-dot-${side}" data-side="${side}">${glyph}</div>`)
    .join("");
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function snapToGrid(value) {
  return Math.round(value / GRID_SIZE) * GRID_SIZE;
}

function average(values) {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function boxIntersectsRect(box, minX, minY, maxX, maxY) {
  return box.x < maxX && box.x + box.width > minX && box.y < maxY && box.y + box.height > minY;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function escapeAttr(str) {
  return escapeHtml(str).replace(/"/g, "&quot;");
}

document.addEventListener("DOMContentLoaded", () => {
  window.plantBuilder = new PlantBuilderApp();
});
