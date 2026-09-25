// Shared client-side auth check, used by every page that needs a logged-in
// user (Builder, Equipment Library, and the Phase 6 management pages).
// This is a UX convenience only -- redirecting an unauthenticated visitor
// to the login page -- not the security boundary. The real enforcement is
// server-side (requireAuth/requireRole on each API route); a page loading
// proves nothing on its own.

export async function requireLogin() {
  const res = await fetch("/api/auth/me", { credentials: "same-origin" });
  if (res.status === 401) {
    const here = encodeURIComponent(location.pathname + location.search);
    location.href = `/login.html?redirect=${here}`;
    return null;
  }
  return res.json();
}

export async function currentUser() {
  const res = await fetch("/api/auth/me", { credentials: "same-origin" });
  if (!res.ok) return null;
  return res.json();
}

export async function logout() {
  await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
  location.href = "/login.html";
}

// Renders the "Signed in as X (role) · Log out" indicator into the given
// container element, once the user is known.
export function renderUserBadge(container, user) {
  container.innerHTML = `
    <span class="user-badge-name">${escapeHtml(user.firstName)} ${escapeHtml(user.lastName)}</span>
    <span class="user-badge-role">${escapeHtml(user.role)}</span>
    <button type="button" id="btn-logout" class="link-btn">Log out</button>
  `;
  container.querySelector("#btn-logout").addEventListener("click", () => logout());
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}
