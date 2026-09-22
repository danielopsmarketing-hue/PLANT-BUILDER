import { iconSvg } from "./icons.js";
import { fetchCategories, fetchEquipment, createEquipment, updateEquipment, deleteEquipment } from "./api.js";

class AdminApp {
  constructor() {
    this.categories = [];
    this.equipment = [];
    this.editingId = null;
    this.removeImageFlag = false;
    this.newImageFile = null;

    this.els = {
      tableBody: document.getElementById("admin-table-body"),
      status: document.getElementById("admin-status"),
      modalBackdrop: document.getElementById("equipment-modal-backdrop"),
      modalTitle: document.getElementById("equipment-modal-title"),
      form: document.getElementById("equipment-form"),
      fieldId: document.getElementById("field-id"),
      fieldName: document.getElementById("field-name"),
      fieldModel: document.getElementById("field-model"),
      fieldCategory: document.getElementById("field-category"),
      fieldIcon: document.getElementById("field-icon"),
      fieldImage: document.getElementById("field-image"),
      imagePreviewRow: document.getElementById("image-preview-row"),
      imagePreview: document.getElementById("image-preview"),
      btnRemoveImage: document.getElementById("btn-remove-image"),
      specsRows: document.getElementById("specs-rows"),
      fieldBrochure: document.getElementById("field-brochure"),
    };

    this.bind();
    this.load();
  }

  bind() {
    document.getElementById("btn-add-equipment").addEventListener("click", () => this.openModal());
    document.getElementById("equipment-modal-cancel").addEventListener("click", () => this.closeModal());
    document.getElementById("btn-add-spec").addEventListener("click", () => this.addSpecRow("", ""));
    this.els.form.addEventListener("submit", (e) => this.onSubmit(e));

    this.els.fieldImage.addEventListener("change", () => {
      const file = this.els.fieldImage.files[0];
      if (!file) return;
      this.newImageFile = file;
      this.removeImageFlag = false;
      const reader = new FileReader();
      reader.onload = () => this.showImagePreview(reader.result);
      reader.readAsDataURL(file);
    });

    this.els.btnRemoveImage.addEventListener("click", () => {
      this.newImageFile = null;
      this.removeImageFlag = true;
      this.els.fieldImage.value = "";
      this.hideImagePreview();
    });
  }

  async load() {
    this.setStatus("Loading equipment…");
    try {
      const [categories, equipment] = await Promise.all([fetchCategories(), fetchEquipment()]);
      this.categories = categories;
      this.equipment = equipment;
      this.populateCategorySelect();
      this.renderTable();
      this.clearStatus();
    } catch (err) {
      this.setStatus(`Couldn't load the catalog: ${err.message}`, true);
    }
  }

  populateCategorySelect() {
    this.els.fieldCategory.innerHTML = this.categories
      .map((c) => `<option value="${c.id}">${escapeHtml(c.label)}</option>`)
      .join("");
  }

  renderTable() {
    if (this.equipment.length === 0) {
      this.els.tableBody.innerHTML = `<tr><td colspan="6" class="admin-loading">No equipment yet. Click "Add Equipment" to create the first listing.</td></tr>`;
      return;
    }

    const rows = this.equipment
      .slice()
      .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name))
      .map((item) => {
        const categoryLabel = this.categories.find((c) => c.id === item.category)?.label || item.category;
        const thumb = item.imagePath
          ? `<img src="${item.imagePath}" class="admin-thumb-img" alt="${escapeHtml(item.name)}" />`
          : `<span class="admin-thumb-icon">${iconSvg(item.icon, item.category)}</span>`;
        const brochureCell = item.brochureUrl
          ? `<a href="${escapeAttr(item.brochureUrl)}" target="_blank" rel="noopener noreferrer">View</a>`
          : `<span class="text-muted">&mdash;</span>`;
        return `
          <tr data-id="${item.id}">
            <td class="admin-thumb-cell">${thumb}</td>
            <td>${escapeHtml(item.name)}</td>
            <td>${escapeHtml(item.model || "")}</td>
            <td>${escapeHtml(categoryLabel)}</td>
            <td>${brochureCell}</td>
            <td class="admin-actions-cell">
              <button type="button" class="link-btn" data-action="edit" data-id="${item.id}">Edit</button>
              <button type="button" class="link-btn danger-link" data-action="delete" data-id="${item.id}">Delete</button>
            </td>
          </tr>`;
      })
      .join("");
    this.els.tableBody.innerHTML = rows;

    for (const btn of this.els.tableBody.querySelectorAll('[data-action="edit"]')) {
      btn.addEventListener("click", () => this.openModal(btn.dataset.id));
    }
    for (const btn of this.els.tableBody.querySelectorAll('[data-action="delete"]')) {
      btn.addEventListener("click", () => this.onDelete(btn.dataset.id));
    }
  }

  // ---------- Modal ----------

  openModal(id) {
    this.editingId = id || null;
    this.newImageFile = null;
    this.removeImageFlag = false;
    this.els.fieldImage.value = "";
    this.els.specsRows.innerHTML = "";

    if (id) {
      const item = this.equipment.find((e) => e.id === id);
      this.els.modalTitle.textContent = "Edit Equipment";
      this.els.fieldId.value = item.id;
      this.els.fieldName.value = item.name;
      this.els.fieldModel.value = item.model || "";
      this.els.fieldCategory.value = item.category;
      this.els.fieldIcon.value = item.icon || "generic";
      this.els.fieldBrochure.value = item.brochureUrl || "";
      const entries = Object.entries(item.specs || {});
      if (entries.length === 0) this.addSpecRow("", "");
      else for (const [k, v] of entries) this.addSpecRow(k, v);
      if (item.imagePath) this.showImagePreview(item.imagePath);
      else this.hideImagePreview();
    } else {
      this.els.modalTitle.textContent = "Add Equipment";
      this.els.fieldId.value = "";
      this.els.form.reset();
      this.addSpecRow("", "");
      this.hideImagePreview();
    }

    this.els.modalBackdrop.classList.remove("hidden");
    this.els.fieldName.focus();
  }

  closeModal() {
    this.els.modalBackdrop.classList.add("hidden");
  }

  showImagePreview(src) {
    this.els.imagePreview.src = src;
    this.els.imagePreviewRow.hidden = false;
  }

  hideImagePreview() {
    this.els.imagePreviewRow.hidden = true;
    this.els.imagePreview.src = "";
  }

  addSpecRow(key, value) {
    const row = document.createElement("div");
    row.className = "spec-row";
    row.innerHTML = `
      <input type="text" class="spec-key" placeholder="Label (e.g. Power)" value="${escapeAttr(key)}" />
      <input type="text" class="spec-value" placeholder="Value (e.g. 125 hp)" value="${escapeAttr(value)}" />
      <button type="button" class="link-btn remove-spec" title="Remove row">&times;</button>
    `;
    row.querySelector(".remove-spec").addEventListener("click", () => row.remove());
    this.els.specsRows.appendChild(row);
  }

  collectSpecs() {
    const specs = {};
    for (const row of this.els.specsRows.querySelectorAll(".spec-row")) {
      const key = row.querySelector(".spec-key").value.trim();
      const value = row.querySelector(".spec-value").value.trim();
      if (key) specs[key] = value;
    }
    return specs;
  }

  async onSubmit(e) {
    e.preventDefault();
    const formData = new FormData();
    formData.set("name", this.els.fieldName.value.trim());
    formData.set("model", this.els.fieldModel.value.trim());
    formData.set("category", this.els.fieldCategory.value);
    formData.set("icon", this.els.fieldIcon.value);
    formData.set("specs", JSON.stringify(this.collectSpecs()));
    formData.set("brochureUrl", this.els.fieldBrochure.value.trim());
    if (this.newImageFile) formData.set("image", this.newImageFile);
    if (this.removeImageFlag) formData.set("removeImage", "true");

    const submitBtn = this.els.form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    try {
      if (this.editingId) await updateEquipment(this.editingId, formData);
      else await createEquipment(formData);
      this.closeModal();
      await this.load();
      this.setStatus("Saved.", false, true);
    } catch (err) {
      this.setStatus(`Couldn't save: ${err.message}`, true);
    } finally {
      submitBtn.disabled = false;
    }
  }

  async onDelete(id) {
    const item = this.equipment.find((e) => e.id === id);
    if (!confirm(`Delete "${item?.name || "this item"}"? This cannot be undone.`)) return;
    try {
      await deleteEquipment(id);
      await this.load();
      this.setStatus("Deleted.", false, true);
    } catch (err) {
      this.setStatus(`Couldn't delete: ${err.message}`, true);
    }
  }

  setStatus(message, isError, autoHide) {
    this.els.status.textContent = message;
    this.els.status.classList.remove("hidden");
    this.els.status.classList.toggle("admin-status-error", !!isError);
    if (autoHide) setTimeout(() => this.clearStatus(), 2000);
  }

  clearStatus() {
    this.els.status.classList.add("hidden");
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

function escapeAttr(str) {
  return escapeHtml(str).replace(/"/g, "&quot;");
}

document.addEventListener("DOMContentLoaded", () => {
  window.adminApp = new AdminApp();
});
