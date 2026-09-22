import { CATEGORIES, EQUIPMENT, getEquipmentById } from "./catalog-data.js";
import { iconSvg, colorForCategory } from "./icons.js";
import { listLayouts, saveLayout, loadLayout, deleteLayout } from "./storage.js";

const NODE_WIDTH = 140;
const NODE_HEIGHT = 92;

class PlantBuilderApp {
  constructor() {
    this.nodes = new Map();
    this.connectors = new Map();
    this.selection = null; // { type: 'node' | 'connector', id }
    this.view = { scale: 1, panX: 40, panY: 40 };
    this.connectMode = false;
    this.pendingConnectFrom = null;
    this.currentLayoutId = null;
    this.nextId = 1;

    this.els = {
      viewport: document.getElementById("canvas-viewport"),
      world: document.getElementById("canvas-world"),
      svg: document.getElementById("connector-layer"),
      emptyHint: document.getElementById("canvas-empty-hint"),
      catalogList: document.getElementById("catalog-list"),
      inspectorContent: document.getElementById("inspector-content"),
      zoomLevel: document.getElementById("zoom-level"),
      loadSelect: document.getElementById("load-select"),
      modalBackdrop: document.getElementById("modal-backdrop"),
      modalTitle: document.getElementById("modal-title"),
      modalInput: document.getElementById("modal-input"),
    };

    this.buildCatalogPanel();
    this.bindToolbar();
    this.bindCanvasEvents();
    this.bindKeyboard();
    this.refreshLayoutList();
    this.applyViewTransform();
    this.render();
  }

  // ---------- Catalog panel ----------

  buildCatalogPanel() {
    const list = this.els.catalogList;
    list.innerHTML = "";
    for (const category of CATEGORIES) {
      const items = EQUIPMENT.filter((e) => e.category === category.id);
      if (items.length === 0) continue;

      const group = document.createElement("div");
      group.className = "catalog-group";

      const heading = document.createElement("h3");
      heading.textContent = category.label;
      group.appendChild(heading);

      for (const item of items) {
        const el = document.createElement("div");
        el.className = "catalog-item";
        el.draggable = true;
        el.dataset.equipmentId = item.id;
        el.innerHTML = `
          <span class="catalog-item-icon">${iconSvg(item.icon, item.category)}</span>
          <span class="catalog-item-label">
            <span class="catalog-item-name">${item.name}</span>
            <span class="catalog-item-model">${item.model}</span>
          </span>`;
        el.addEventListener("dragstart", (e) => {
          e.dataTransfer.setData("text/equipment-id", item.id);
          e.dataTransfer.effectAllowed = "copy";
        });
        group.appendChild(el);
      }
      list.appendChild(group);
    }
  }

  // ---------- Toolbar ----------

  bindToolbar() {
    document.getElementById("btn-new").addEventListener("click", () => this.newLayout());
    document.getElementById("btn-save").addEventListener("click", () => this.promptSave());
    document.getElementById("btn-load").addEventListener("click", () => this.loadSelected());
    document.getElementById("btn-delete-layout").addEventListener("click", () => this.deleteSelected());
    document.getElementById("btn-connect").addEventListener("click", () => this.toggleConnectMode());
    document.getElementById("btn-zoom-in").addEventListener("click", () => this.zoomBy(1.2));
    document.getElementById("btn-zoom-out").addEventListener("click", () => this.zoomBy(1 / 1.2));
    document.getElementById("btn-zoom-reset").addEventListener("click", () => this.resetView());
    document.getElementById("btn-export").addEventListener("click", () => this.exportPng());

    document.getElementById("modal-cancel").addEventListener("click", () => this.closeModal());
    document.getElementById("modal-confirm").addEventListener("click", () => this.confirmModal());
  }

  // ---------- Canvas: drop, pan, zoom, node drag ----------

  bindCanvasEvents() {
    const viewport = this.els.viewport;

    viewport.addEventListener("dragover", (e) => e.preventDefault());
    viewport.addEventListener("drop", (e) => {
      e.preventDefault();
      const equipmentId = e.dataTransfer.getData("text/equipment-id");
      if (!equipmentId) return;
      const { x, y } = this.clientToWorld(e.clientX, e.clientY);
      this.addNode(equipmentId, x - NODE_WIDTH / 2, y - NODE_HEIGHT / 2);
    });

    viewport.addEventListener("wheel", (e) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      this.zoomBy(factor, e.clientX, e.clientY);
    }, { passive: false });

    // Panning when dragging the empty canvas background.
    let panning = false;
    let panStart = null;
    viewport.addEventListener("mousedown", (e) => {
      if (e.target !== viewport && e.target !== this.els.world && e.target !== this.els.svg) return;
      panning = true;
      panStart = { x: e.clientX, y: e.clientY, panX: this.view.panX, panY: this.view.panY };
      this.setSelection(null);
      if (this.connectMode) this.cancelConnect();
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
      if ((e.key === "Delete" || e.key === "Backspace") && this.selection) {
        e.preventDefault();
        this.deleteSelection();
      } else if (e.key === "Escape") {
        if (this.connectMode) this.cancelConnect();
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
    this.nodes.set(id, { id, equipmentId, x, y, notes: "" });
    this.setSelection({ type: "node", id });
    this.render();
    return id;
  }

  deleteNode(id) {
    this.nodes.delete(id);
    for (const [cid, c] of this.connectors) {
      if (c.from === id || c.to === id) this.connectors.delete(cid);
    }
  }

  // ---------- Connectors ----------

  toggleConnectMode() {
    this.connectMode = !this.connectMode;
    this.pendingConnectFrom = null;
    document.getElementById("btn-connect").classList.toggle("active", this.connectMode);
    this.els.viewport.classList.toggle("connect-mode", this.connectMode);
  }

  cancelConnect() {
    this.connectMode = false;
    this.pendingConnectFrom = null;
    document.getElementById("btn-connect").classList.remove("active");
    this.els.viewport.classList.remove("connect-mode");
    this.render();
  }

  handleNodeClickForConnect(nodeId) {
    if (!this.pendingConnectFrom) {
      this.pendingConnectFrom = nodeId;
      this.render();
      return;
    }
    if (this.pendingConnectFrom === nodeId) {
      this.pendingConnectFrom = null;
      this.render();
      return;
    }
    const id = `conn-${this.nextId++}`;
    this.connectors.set(id, { id, from: this.pendingConnectFrom, to: nodeId });
    this.pendingConnectFrom = null;
    this.render();
  }

  deleteConnector(id) {
    this.connectors.delete(id);
  }

  // ---------- Selection / Inspector ----------

  setSelection(selection) {
    this.selection = selection;
    this.renderInspector();
    this.renderSelectionHighlight();
  }

  deleteSelection() {
    if (!this.selection) return;
    if (this.selection.type === "node") this.deleteNode(this.selection.id);
    else this.deleteConnector(this.selection.id);
    this.selection = null;
    this.render();
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
      const spec = getEquipmentById(node.equipmentId);
      content.className = "";
      const specRows = Object.entries(spec.specs)
        .map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`)
        .join("");
      content.innerHTML = `
        <div class="inspector-header">
          <span class="inspector-icon">${iconSvg(spec.icon, spec.category)}</span>
          <div>
            <div class="inspector-name">${spec.name}</div>
            <div class="inspector-model">${spec.model}</div>
          </div>
        </div>
        <table class="inspector-specs">${specRows}</table>
        <div class="inspector-position">Position: ${Math.round(node.x)}, ${Math.round(node.y)}</div>
        <label class="inspector-notes-label" for="inspector-notes">Notes</label>
        <textarea id="inspector-notes" rows="5" placeholder="Free-text notes for this item…">${escapeHtml(node.notes)}</textarea>
        <button id="inspector-delete" class="danger">Delete from canvas</button>
      `;
      document.getElementById("inspector-notes").addEventListener("input", (e) => {
        node.notes = e.target.value;
      });
      document.getElementById("inspector-delete").addEventListener("click", () => this.deleteSelection());
    } else {
      const conn = this.connectors.get(this.selection.id);
      if (!conn) return;
      const fromSpec = getEquipmentById(this.nodes.get(conn.from)?.equipmentId);
      const toSpec = getEquipmentById(this.nodes.get(conn.to)?.equipmentId);
      content.className = "";
      content.innerHTML = `
        <div class="inspector-header">
          <div>
            <div class="inspector-name">Connector</div>
            <div class="inspector-model">${fromSpec?.name || "?"} &rarr; ${toSpec?.name || "?"}</div>
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
    for (const el of this.els.svg.querySelectorAll(".connector-line")) {
      el.classList.toggle("selected", this.selection?.type === "connector" && this.selection.id === el.dataset.id);
    }
  }

  // ---------- Rendering ----------

  render() {
    this.renderNodes();
    this.renderConnectors();
    this.renderInspector();
    this.els.emptyHint.style.display = this.nodes.size === 0 ? "block" : "none";
  }

  renderNodes() {
    for (const el of Array.from(this.els.world.querySelectorAll(".node"))) el.remove();

    for (const node of this.nodes.values()) {
      const spec = getEquipmentById(node.equipmentId);
      const el = document.createElement("div");
      el.className = "node";
      el.dataset.id = node.id;
      el.style.left = `${node.x}px`;
      el.style.top = `${node.y}px`;
      el.style.width = `${NODE_WIDTH}px`;
      el.style.borderColor = colorForCategory(spec.category);
      if (this.pendingConnectFrom === node.id) el.classList.add("connect-pending");
      el.innerHTML = `
        <div class="node-icon">${iconSvg(spec.icon, spec.category)}</div>
        <div class="node-label">
          <div class="node-name">${spec.name}</div>
          <div class="node-model">${spec.model}</div>
        </div>`;

      el.addEventListener("mousedown", (e) => this.onNodeMouseDown(e, node));
      this.els.world.appendChild(el);
    }
  }

  onNodeMouseDown(e, node) {
    e.stopPropagation();

    if (this.connectMode) {
      this.handleNodeClickForConnect(node.id);
      return;
    }

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
      node.x = startNodeX + dx;
      node.y = startNodeY + dy;
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
      if (moved) this.renderConnectors();
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
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
      const from = this.nodes.get(conn.from);
      const to = this.nodes.get(conn.to);
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
    this.renderSelectionHighlight();
  }

  nodeAnchor(node, towardsNode) {
    const cx = node.x + NODE_WIDTH / 2;
    const cy = node.y + NODE_HEIGHT / 2;
    const tcx = towardsNode.x + NODE_WIDTH / 2;
    const tcy = towardsNode.y + NODE_HEIGHT / 2;
    const dx = tcx - cx;
    const dy = tcy - cy;
    const angle = Math.atan2(dy, dx);
    const halfW = NODE_WIDTH / 2;
    const halfH = NODE_HEIGHT / 2;
    // Clamp the anchor to the node's rectangular edge.
    const scale = Math.min(
      Math.abs(halfW / Math.cos(angle) || Infinity),
      Math.abs(halfH / Math.sin(angle) || Infinity)
    );
    return { x: cx + Math.cos(angle) * scale, y: cy + Math.sin(angle) * scale };
  }

  // ---------- Save / Load ----------

  newLayout() {
    if (this.nodes.size > 0 && !confirm("Clear the current layout? Unsaved changes will be lost.")) return;
    this.nodes.clear();
    this.connectors.clear();
    this.currentLayoutId = null;
    this.setSelection(null);
    this.resetView();
    this.render();
  }

  promptSave() {
    this.openModal("Save Layout", "Save", (name) => {
      if (!name) return;
      this.currentLayoutId = saveLayout(name, {
        id: this.currentLayoutId,
        nodes: Array.from(this.nodes.values()),
        connectors: Array.from(this.connectors.values()),
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
    for (const n of layout.nodes) this.nodes.set(n.id, n);
    for (const c of layout.connectors) this.connectors.set(c.id, c);
    this.currentLayoutId = layout.id;
    this.setSelection(null);
    this.render();
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
    if (this.nodes.size === 0) {
      alert("Add some equipment to the canvas before exporting.");
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
    for (const node of this.nodes.values()) {
      minX = Math.min(minX, node.x);
      minY = Math.min(minY, node.y);
      maxX = Math.max(maxX, node.x + NODE_WIDTH);
      maxY = Math.max(maxY, node.y + NODE_HEIGHT);
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
      <div class="export-brand-mark">IE</div>
      <div>
        <div class="export-brand-name">Ironpeak Equipment</div>
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
    inner.appendChild(this.els.world.cloneNode(true));
    inner.firstChild.style.transform = "none";
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
      const spec = getEquipmentById(node.equipmentId);
      return `<tr><td>${spec.name}</td><td>${spec.model}</td><td>${escapeHtml(node.notes || "")}</td></tr>`;
    });
    table.innerHTML = `
      <thead><tr><th>Equipment</th><th>Model</th><th>Notes</th></tr></thead>
      <tbody>${rows.join("")}</tbody>`;
    container.appendChild(table);
    return container;
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

document.addEventListener("DOMContentLoaded", () => {
  window.plantBuilder = new PlantBuilderApp();
});
