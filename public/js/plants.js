import { fetchAllPlants } from "./api.js";

class AllPlantsApp {
  constructor() {
    this.plants = [];
    this.searchTerm = "";

    this.els = {
      tableBody: document.getElementById("plants-table-body"),
      status: document.getElementById("admin-status"),
      search: document.getElementById("plants-search"),
    };

    this.els.search.addEventListener("input", () => {
      this.searchTerm = this.els.search.value.trim().toLowerCase();
      this.renderTable();
    });

    this.load();
  }

  async load() {
    this.setStatus("Loading plants…");
    try {
      this.plants = await fetchAllPlants();
      this.renderTable();
      this.clearStatus();
    } catch (err) {
      this.setStatus(`Couldn't load plants: ${err.message}`, true);
    }
  }

  renderTable() {
    const filtered = this.searchTerm
      ? this.plants.filter((p) => p.name.toLowerCase().includes(this.searchTerm) || p.ownerName.toLowerCase().includes(this.searchTerm))
      : this.plants;

    if (this.plants.length === 0) {
      this.els.tableBody.innerHTML = `<tr><td colspan="5" class="admin-loading">No plants have been saved yet.</td></tr>`;
      return;
    }
    if (filtered.length === 0) {
      this.els.tableBody.innerHTML = `<tr><td colspan="5" class="admin-loading">No plants match "${escapeHtml(this.els.search.value)}".</td></tr>`;
      return;
    }

    this.els.tableBody.innerHTML = filtered
      .map((p) => `
        <tr>
          <td>${escapeHtml(p.name)}</td>
          <td>${escapeHtml(p.ownerName)}</td>
          <td>${p.version}</td>
          <td>${formatDate(p.updatedAt)}</td>
          <td>${p.lastOpenedAt ? formatDate(p.lastOpenedAt) : `<span class="text-muted">Never</span>`}</td>
        </tr>`)
      .join("");
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

function formatDate(iso) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

function boot() {
  window.allPlantsApp = new AllPlantsApp();
}

// Loaded via a dynamic import after an async login/role check, so
// DOMContentLoaded may have already fired by the time this runs -- same
// bootstrap-order issue app.js/admin.js/users.js all hit.
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
