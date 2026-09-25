import { fetchUsers, inviteUser, updateUser } from "./api.js";

const ROLES = ["admin", "manager", "staff"];

class UsersApp {
  constructor() {
    this.users = [];

    this.els = {
      tableBody: document.getElementById("users-table-body"),
      status: document.getElementById("admin-status"),
      inviteLinkPanel: document.getElementById("invite-link-panel"),
      inviteLinkName: document.getElementById("invite-link-name"),
      inviteLinkValue: document.getElementById("invite-link-value"),
      btnCopyInviteLink: document.getElementById("btn-copy-invite-link"),
      modalBackdrop: document.getElementById("invite-modal-backdrop"),
      form: document.getElementById("invite-form"),
      fieldFirstName: document.getElementById("field-first-name"),
      fieldLastName: document.getElementById("field-last-name"),
      fieldEmail: document.getElementById("field-email"),
      fieldRole: document.getElementById("field-role"),
    };

    this.bind();
    this.load();
  }

  bind() {
    document.getElementById("btn-invite-user").addEventListener("click", () => this.openModal());
    document.getElementById("invite-modal-cancel").addEventListener("click", () => this.closeModal());
    this.els.form.addEventListener("submit", (e) => this.onInviteSubmit(e));
    this.els.btnCopyInviteLink.addEventListener("click", () => this.copyInviteLink());
  }

  async load() {
    this.setStatus("Loading users…");
    try {
      this.users = await fetchUsers();
      this.renderTable();
      this.clearStatus();
    } catch (err) {
      this.setStatus(`Couldn't load users: ${err.message}`, true);
    }
  }

  renderTable() {
    if (this.users.length === 0) {
      this.els.tableBody.innerHTML = `<tr><td colspan="6" class="admin-loading">No users yet.</td></tr>`;
      return;
    }

    const currentUserId = window.__currentUserId;
    const rows = this.users
      .map((user) => {
        const lastLogin = user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleDateString() : "Never";
        const roleOptions = ROLES.map((r) => `<option value="${r}"${r === user.role ? " selected" : ""}>${capitalize(r)}</option>`).join("");
        const isSelf = user.id === currentUserId;
        const statusActionBtn = user.status === "invited"
          ? `<span class="text-muted">Awaiting setup</span>`
          : user.status === "active"
            ? `<button type="button" class="link-btn danger-link" data-action="deactivate" data-id="${user.id}"${isSelf ? " disabled title=\"You can't deactivate your own account\"" : ""}>Deactivate</button>`
            : `<button type="button" class="link-btn" data-action="activate" data-id="${user.id}">Reactivate</button>`;
        return `
          <tr data-id="${user.id}">
            <td>${escapeHtml(user.firstName)} ${escapeHtml(user.lastName)}</td>
            <td>${escapeHtml(user.email)}</td>
            <td><select class="role-select" data-id="${user.id}"${isSelf ? " disabled title=\"You can't change your own role\"" : ""}>${roleOptions}</select></td>
            <td><span class="status-badge status-badge-${user.status}">${capitalize(user.status)}</span></td>
            <td>${lastLogin}</td>
            <td class="admin-actions-cell">${statusActionBtn}</td>
          </tr>`;
      })
      .join("");
    this.els.tableBody.innerHTML = rows;

    for (const select of this.els.tableBody.querySelectorAll(".role-select")) {
      select.addEventListener("change", () => this.onRoleChange(select.dataset.id, select.value));
    }
    for (const btn of this.els.tableBody.querySelectorAll('[data-action="deactivate"]')) {
      btn.addEventListener("click", () => this.onStatusChange(btn.dataset.id, "inactive"));
    }
    for (const btn of this.els.tableBody.querySelectorAll('[data-action="activate"]')) {
      btn.addEventListener("click", () => this.onStatusChange(btn.dataset.id, "active"));
    }
  }

  async onRoleChange(id, role) {
    try {
      await updateUser(id, { role });
      await this.load();
      this.setStatus("Role updated.", false, true);
    } catch (err) {
      this.setStatus(`Couldn't update role: ${err.message}`, true);
      await this.load(); // revert the <select> to the actual server state
    }
  }

  async onStatusChange(id, status) {
    const user = this.users.find((u) => u.id === id);
    if (status === "inactive" && !confirm(`Deactivate ${user?.firstName || "this user"}? They'll be signed out immediately and won't be able to log back in until reactivated.`)) return;
    try {
      await updateUser(id, { status });
      await this.load();
      this.setStatus(status === "active" ? "Account reactivated." : "Account deactivated.", false, true);
    } catch (err) {
      this.setStatus(`Couldn't update status: ${err.message}`, true);
    }
  }

  // ---------- Invite modal ----------

  openModal() {
    this.els.form.reset();
    this.els.inviteLinkPanel.classList.add("hidden");
    this.els.modalBackdrop.classList.remove("hidden");
    this.els.fieldFirstName.focus();
  }

  closeModal() {
    this.els.modalBackdrop.classList.add("hidden");
  }

  async onInviteSubmit(e) {
    e.preventDefault();
    const submitBtn = this.els.form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    try {
      const { user, invitationLink } = await inviteUser({
        firstName: this.els.fieldFirstName.value.trim(),
        lastName: this.els.fieldLastName.value.trim(),
        email: this.els.fieldEmail.value.trim(),
        role: this.els.fieldRole.value,
      });
      this.closeModal();
      await this.load();
      this.showInviteLink(user, invitationLink);
      this.setStatus("Invitation created.", false, true);
    } catch (err) {
      this.setStatus(`Couldn't invite: ${err.message}`, true);
    } finally {
      submitBtn.disabled = false;
    }
  }

  showInviteLink(user, link) {
    this.els.inviteLinkName.textContent = `${user.firstName} ${user.lastName}`;
    this.els.inviteLinkValue.value = link;
    this.els.inviteLinkPanel.classList.remove("hidden");
  }

  async copyInviteLink() {
    try {
      await navigator.clipboard.writeText(this.els.inviteLinkValue.value);
      const original = this.els.btnCopyInviteLink.textContent;
      this.els.btnCopyInviteLink.textContent = "Copied!";
      setTimeout(() => { this.els.btnCopyInviteLink.textContent = original; }, 1500);
    } catch {
      this.els.inviteLinkValue.select();
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

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

function boot() {
  window.usersApp = new UsersApp();
}

// users.js is dynamically imported after an async login/role check, so
// DOMContentLoaded may have already fired by the time this runs (same
// bootstrap-order issue app.js hit in Phase 2e).
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
