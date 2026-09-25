// Thin client over the real plant-projects API (server/plants.js) --
// replaces the earlier localStorage-only stand-in. Same exported
// function names/shapes as before, so app.js's calling code barely
// changed to move onto this.

const BASE = "/api/plants";

async function handle(res) {
  if (res.status === 204) return null;
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error((body && body.error) || `Request failed (${res.status})`);
  return body;
}

export async function listLayouts() {
  const plants = await fetch(BASE, { credentials: "same-origin" }).then(handle);
  return plants
    .map((p) => ({ id: p.id, name: p.name, savedAt: new Date(p.updatedAt).getTime() }))
    .sort((a, b) => b.savedAt - a.savedAt);
}

export async function saveLayout(name, state) {
  const data = { nodes: state.nodes, connectors: state.connectors, shapes: state.shapes, lines: state.lines };
  if (state.id) {
    const updated = await fetch(`${BASE}/${state.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ name, data }),
    }).then(handle);
    return updated.id;
  }
  const created = await fetch(BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ name, data }),
  }).then(handle);
  return created.id;
}

export async function loadLayout(id) {
  const plant = await fetch(`${BASE}/${id}`, { credentials: "same-origin" }).then(handle).catch(() => null);
  if (!plant) return null;
  return { id: plant.id, name: plant.name, ...plant.data };
}

export async function deleteLayout(id) {
  await fetch(`${BASE}/${id}`, { method: "DELETE", credentials: "same-origin" }).then(handle);
}
