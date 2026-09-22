// Minimal JSON-file-backed data store for the equipment catalog.
// No native modules to compile, no DB server to run — just a file on disk.
// Fine for a single small admin team; revisit if concurrent-write conflicts
// ever become a real problem.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { EQUIPMENT: SEED_EQUIPMENT } = require("./seed-data");

const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "equipment.json");

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    const now = new Date().toISOString();
    const seeded = SEED_EQUIPMENT.map((item) => ({
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
      ...item,
    }));
    fs.writeFileSync(DATA_FILE, JSON.stringify(seeded, null, 2));
  }
}

function readAll() {
  ensureStore();
  const raw = fs.readFileSync(DATA_FILE, "utf-8");
  try {
    return JSON.parse(raw);
  } catch (err) {
    console.error("equipment.json is corrupt:", err);
    return [];
  }
}

function writeAll(items) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(items, null, 2));
}

function list() {
  return readAll().sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
}

function get(id) {
  return readAll().find((item) => item.id === id) || null;
}

function create(data) {
  const items = readAll();
  const now = new Date().toISOString();
  const item = {
    id: crypto.randomUUID(),
    name: data.name,
    model: data.model || "",
    category: data.category,
    icon: data.icon || "generic",
    specs: data.specs || {},
    imagePath: data.imagePath || null,
    brochureUrl: data.brochureUrl || null,
    createdAt: now,
    updatedAt: now,
  };
  items.push(item);
  writeAll(items);
  return item;
}

function update(id, data) {
  const items = readAll();
  const index = items.findIndex((item) => item.id === id);
  if (index === -1) return null;

  const existing = items[index];
  const updated = {
    ...existing,
    name: data.name ?? existing.name,
    model: data.model ?? existing.model,
    category: data.category ?? existing.category,
    icon: data.icon ?? existing.icon,
    specs: data.specs ?? existing.specs,
    brochureUrl: data.brochureUrl !== undefined ? data.brochureUrl : existing.brochureUrl,
    imagePath: data.imagePath !== undefined ? data.imagePath : existing.imagePath,
    updatedAt: new Date().toISOString(),
  };
  items[index] = updated;
  writeAll(items);
  return updated;
}

function remove(id) {
  const items = readAll();
  const index = items.findIndex((item) => item.id === id);
  if (index === -1) return false;
  items.splice(index, 1);
  writeAll(items);
  return true;
}

module.exports = { list, get, create, update, remove, DATA_FILE };
