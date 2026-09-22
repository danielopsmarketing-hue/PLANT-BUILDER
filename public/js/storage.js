// localStorage-backed save/load. This is a stand-in for real server-side
// persistence (see brief: "Backend + database"). It proves the save/load
// interaction works, nothing more — layouts here are single-browser only.

const STORAGE_KEY = "plantBuilder.layouts";

function readAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.error("Failed to read saved layouts", err);
    return [];
  }
}

function writeAll(layouts) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(layouts));
}

export function listLayouts() {
  return readAll()
    .map((l) => ({ id: l.id, name: l.name, savedAt: l.savedAt }))
    .sort((a, b) => b.savedAt - a.savedAt);
}

export function saveLayout(name, state) {
  const layouts = readAll();
  const id = state.id || `layout-${Date.now()}`;
  const record = {
    id,
    name,
    savedAt: Date.now(),
    nodes: state.nodes,
    connectors: state.connectors,
    shapes: state.shapes || [],
    lines: state.lines || [],
  };
  const existingIndex = layouts.findIndex((l) => l.id === id);
  if (existingIndex >= 0) {
    layouts[existingIndex] = record;
  } else {
    layouts.push(record);
  }
  writeAll(layouts);
  return id;
}

export function loadLayout(id) {
  return readAll().find((l) => l.id === id) || null;
}

export function deleteLayout(id) {
  writeAll(readAll().filter((l) => l.id !== id));
}
