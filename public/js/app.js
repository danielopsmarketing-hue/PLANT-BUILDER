import { iconSvg, colorForCategory } from "./icons.js";
import { listLayouts, saveLayout, loadLayout, deleteLayout } from "./storage.js";
import { fetchCategories, fetchEquipment } from "./api.js";

const DEFAULT_NODE_WIDTH = 140;
const DEFAULT_NODE_HEIGHT = 92;
const MIN_NODE_WIDTH = 96;
const MIN_NODE_HEIGHT = 64;
const MAX_NODE_WIDTH = 360;
const MAX_NODE_HEIGHT = 260;
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
    this.selection = null; // { type: 'node' | 'connector' | 'shape' | 'line', id }
    this.view = { scale: 1, panX: 40, panY: 40 };
    this.currentLayoutId = null;
    this.nextId = 1;
    this.collapsedCategories = new Set();
    this.searchTerm = "";

    this.history = [];
    this.historyIndex = -1;

    this.els = {
      viewport: document.getElementById("canvas-viewport"),
      world: document.getElementById("canvas-world"),
      svg: document.getElementById("connector-layer"),
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

  // ---------- Canvas: drop, pan, zoom ----------

  bindCanvasEvents() {
    const viewport = this.els.viewport;

    viewport.addEventListener("wheel", (e) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      this.zoomBy(factor, e.clientX, e.clientY);
    }, { passive: false });

    let panning = false;
    let panStart = null;
    viewport.addEventListener("mousedown", (e) => {
      if (e.target !== viewport && e.target !== this.els.world && e.target !== this.els.svg) return;
      panning = true;
      panStart = { x: e.clientX, y: e.clientY, panX: this.view.panX, panY: this.view.panY };
      this.setSelection(null);
    });
    window.addEventListener("mousemove", (e) => {
      if (!panning) return;
      this.view.panX = panStart.panX + (e.clientX - panStart.x);
      this.view.panY = panStart.panY + (e.clientY - panStart.y);
      this.applyViewTransform();
    });
    window.addEventListener("mouseup", () => { panning = false; });
  }

  bindKeyboard() {
    window.addEventListener("keydown", (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) this.redo();
        else this.undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        this.redo();
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && this.selection) {
        e.preventDefault();
        this.deleteSelection();
      } else if (e.key === "Escape") {
        this.cancelConnectDrag();
        this.setSelection(null);
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
    this.setSelection({ type: "node", id });
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

  setSelection(selection) {
    this.selection = selection;
    this.renderInspector();
    // A line's endpoint handles are only created inside renderConnectors's
    // SVG rebuild (renderFreeLines), not just toggled like the .selected
    // class elsewhere -- so selecting/deselecting a line needs a real
    // re-render, not just renderSelectionHighlight's class toggling.
    this.renderConnectors();
  }

  deleteSelection() {
    if (!this.selection) return;
    const { type, id } = this.selection;
    if (type === "node") this.deleteNode(id);
    else if (type === "shape") this.deleteShape(id);
    else if (type === "line") this.deleteLine(id);
    else this.deleteConnector(id);
    this.selection = null;
    this.render();
    this.pushHistory();
  }

  renderInspector() {
    const content = this.els.inspectorContent;
    if (!this.selection) {
      content.className = "inspector-empty";
      content.textContent = "Select a piece of equipment or a connector to see details here.";
      return;
    }

    if (this.selection.type === "node") {
      const node = this.nodes.get(this.selection.id);
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
    } else if (this.selection.type === "shape") {
      const shape = this.shapes.get(this.selection.id);
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
    } else if (this.selection.type === "line") {
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
      const conn = this.connectors.get(this.selection.id);
      if (!conn) return;
      content.className = "";
      content.innerHTML = `
        <div class="inspector-header">
          <div>
            <div class="inspector-name">Connector</div>
            <div class="inspector-model">${escapeHtml(this.boxLabel(conn.from))} &rarr; ${escapeHtml(this.boxLabel(conn.to))}</div>
          </div>
        </div>
        <button id="inspector-delete" class="danger">Delete connector</button>
      `;
      document.getElementById("inspector-delete").addEventListener("click", () => this.deleteSelection());
    }
  }

  renderSelectionHighlight() {
    for (const el of this.els.world.querySelectorAll(".node")) {
      el.classList.toggle("selected", this.selection?.type === "node" && this.selection.id === el.dataset.id);
    }
    for (const el of this.els.world.querySelectorAll(".shape")) {
      el.classList.toggle("selected", this.selection?.type === "shape" && this.selection.id === el.dataset.id);
    }
    for (const el of this.els.svg.querySelectorAll(".connector-line:not(.free-line)")) {
      el.classList.toggle("selected", this.selection?.type === "connector" && this.selection.id === el.dataset.id);
    }
    for (const el of this.els.svg.querySelectorAll(".free-line")) {
      el.classList.toggle("selected", this.selection?.type === "line" && this.selection.id === el.dataset.id);
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

      el.addEventListener("mousedown", (e) => this.onNodeMouseDown(e, node));
      for (const dot of el.querySelectorAll(".connect-dot")) {
        dot.addEventListener("mousedown", (e) => this.onConnectDotMouseDown(e, node));
      }
      el.querySelector(".resize-handle").addEventListener("mousedown", (e) => this.onResizeMouseDown(e, node));

      this.els.world.appendChild(el);
    }
    this.renderSelectionHighlight();
  }

  onNodeMouseDown(e, node) {
    e.stopPropagation();
    this.setSelection({ type: "node", id: node.id });

    const startX = e.clientX;
    const startY = e.clientY;
    const startNodeX = node.x;
    const startNodeY = node.y;
    let moved = false;

    const onMove = (ev) => {
      const dx = (ev.clientX - startX) / this.view.scale;
      const dy = (ev.clientY - startY) / this.view.scale;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) moved = true;
      const rawX = startNodeX + dx;
      const rawY = startNodeY + dy;
      node.x = ev.altKey ? rawX : snapToGrid(rawX);
      node.y = ev.altKey ? rawY : snapToGrid(rawY);
      const el = this.els.world.querySelector(`.node[data-id="${node.id}"]`);
      if (el) {
        el.style.left = `${node.x}px`;
        el.style.top = `${node.y}px`;
      }
      this.renderConnectors();
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      if (moved) {
        this.renderConnectors();
        this.pushHistory();
      }
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
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
    this.connectors.set(id, { id, from: fromId, to: toId });
    this.render();
    this.pushHistory();
  }

  nodeCenter(node) {
    return { x: node.x + node.width / 2, y: node.y + node.height / 2 };
  }

  renderConnectors() {
    const svg = this.els.svg;
    svg.innerHTML = `
      <defs>
        <marker id="arrowhead" markerWidth="10" markerHeight="10" refX="8" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8 Z" fill="#374151"/>
        </marker>
      </defs>`;

    for (const conn of this.connectors.values()) {
      const from = this.getBox(conn.from);
      const to = this.getBox(conn.to);
      if (!from || !to) continue;

      const p1 = this.nodeAnchor(from, to);
      const p2 = this.nodeAnchor(to, from);

      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", p1.x);
      line.setAttribute("y1", p1.y);
      line.setAttribute("x2", p2.x);
      line.setAttribute("y2", p2.y);
      line.setAttribute("class", "connector-line");
      line.setAttribute("marker-end", "url(#arrowhead)");
      line.dataset.id = conn.id;
      line.addEventListener("mousedown", (e) => {
        e.stopPropagation();
        this.setSelection({ type: "connector", id: conn.id });
      });
      svg.appendChild(line);
    }
    this.renderFreeLines();
    this.renderSelectionHighlight();
  }

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
    this.setSelection({ type: "shape", id });
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
    this.setSelection({ type: "line", id });
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
      el.addEventListener("mousedown", (e) => this.onShapeMouseDown(e, shape));
      for (const dot of el.querySelectorAll(".connect-dot")) {
        dot.addEventListener("mousedown", (e) => this.onConnectDotMouseDown(e, shape));
      }
      el.querySelector(".resize-handle").addEventListener("mousedown", (e) => this.onShapeResizeMouseDown(e, shape));
      this.els.world.appendChild(el);
    }
    this.renderSelectionHighlight();
  }

  onShapeMouseDown(e, shape) {
    e.stopPropagation();
    this.setSelection({ type: "shape", id: shape.id });

    const startX = e.clientX;
    const startY = e.clientY;
    const startShapeX = shape.x;
    const startShapeY = shape.y;
    let moved = false;

    const onMove = (ev) => {
      const dx = (ev.clientX - startX) / this.view.scale;
      const dy = (ev.clientY - startY) / this.view.scale;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) moved = true;
      const rawX = startShapeX + dx;
      const rawY = startShapeY + dy;
      shape.x = ev.altKey ? rawX : snapToGrid(rawX);
      shape.y = ev.altKey ? rawY : snapToGrid(rawY);
      const el = this.els.world.querySelector(`.shape[data-id="${shape.id}"]`);
      if (el) {
        el.style.left = `${shape.x}px`;
        el.style.top = `${shape.y}px`;
      }
      this.renderConnectors();
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      if (moved) this.pushHistory();
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
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
        this.setSelection({ type: "line", id: line.id });
      });
      svg.appendChild(el);

      if (this.selection?.type === "line" && this.selection.id === line.id) {
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
    this.setSelection({ type: "line", id: line.id });
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
    this.selection = null;
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
    this.setSelection(null);
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
    for (const c of layout.connectors) this.connectors.set(c.id, c);
    for (const s of layout.shapes || []) this.shapes.set(s.id, s);
    for (const l of layout.lines || []) this.lines.set(l.id, l);
    this.currentLayoutId = layout.id;
    this.setSelection(null);
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
