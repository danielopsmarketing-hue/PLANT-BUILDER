// Thin fetch wrappers around the backend REST API. Shared by the main
// app (read-only catalog) and the admin page (full CRUD + uploads).

const BASE = "/api";

async function handle(res) {
  if (res.status === 204) return null;
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error((body && body.error) || `Request failed (${res.status})`);
  }
  return body;
}

export function fetchCategories() {
  return fetch(`${BASE}/categories`).then(handle);
}

export function fetchEquipment() {
  return fetch(`${BASE}/equipment`).then(handle);
}

export function createEquipment(formData) {
  return fetch(`${BASE}/equipment`, { method: "POST", body: formData }).then(handle);
}

export function updateEquipment(id, formData) {
  return fetch(`${BASE}/equipment/${id}`, { method: "PUT", body: formData }).then(handle);
}

export function deleteEquipment(id) {
  return fetch(`${BASE}/equipment/${id}`, { method: "DELETE" }).then(handle);
}
