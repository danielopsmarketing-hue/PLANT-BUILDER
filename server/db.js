// Equipment catalog, on the shared SQLite connection (see database.js).
//
// Public API is unchanged from the JSON-file version (list/get/create/
// update/remove) so server.js needed no changes for this migration.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { db, DATA_DIR } = require("./database");
const { EQUIPMENT: SEED_EQUIPMENT } = require("./seed-data");

const LEGACY_JSON_FILE = path.join(DATA_DIR, "equipment.json");

db.exec(`
  CREATE TABLE IF NOT EXISTS equipment (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    model TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL,
    icon TEXT NOT NULL DEFAULT 'generic',
    specs TEXT NOT NULL DEFAULT '{}',
    imagePath TEXT,
    brochureUrl TEXT,
    stockUrl TEXT,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  )
`);

seedIfEmpty();

// First run against a fresh DB file: if an equipment.json from the old
// JSON-file store is sitting there (an existing deployment being
// upgraded), import its real records instead of silently reseeding over
// whatever the catalog admin already edited. Only a brand-new install
// (no JSON file either) seeds from server/seed-data.js.
function seedIfEmpty() {
  const { count } = db.prepare("SELECT COUNT(*) AS count FROM equipment").get();
  if (count > 0) return;

  const source = fs.existsSync(LEGACY_JSON_FILE) ? loadLegacyJson() : null;
  const now = new Date().toISOString();
  const rows = source
    ? source
    : SEED_EQUIPMENT.map((item) => ({ id: crypto.randomUUID(), createdAt: now, updatedAt: now, ...item }));

  const insert = db.prepare(`
    INSERT INTO equipment (id, name, model, category, icon, specs, imagePath, brochureUrl, stockUrl, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  db.exec("BEGIN");
  try {
    for (const item of rows) insert.run(...rowParams(item));
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }

  if (source) {
    console.log(`Migrated ${source.length} equipment records from equipment.json into plantbuilder.db`);
  }
}

function loadLegacyJson() {
  try {
    return JSON.parse(fs.readFileSync(LEGACY_JSON_FILE, "utf-8"));
  } catch (err) {
    console.error("Couldn't read legacy equipment.json, seeding from server/seed-data.js instead:", err);
    return null;
  }
}

function rowParams(item) {
  return [
    item.id,
    item.name,
    item.model || "",
    item.category,
    item.icon || "generic",
    JSON.stringify(item.specs || {}),
    item.imagePath || null,
    item.brochureUrl || null,
    item.stockUrl || null,
    item.createdAt,
    item.updatedAt,
  ];
}

function rowToItem(row) {
  if (!row) return null;
  return { ...row, specs: JSON.parse(row.specs) };
}

function list() {
  const rows = db.prepare("SELECT * FROM equipment").all();
  return rows.map(rowToItem).sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
}

function get(id) {
  return rowToItem(db.prepare("SELECT * FROM equipment WHERE id = ?").get(id));
}

function create(data) {
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
    stockUrl: data.stockUrl || null,
    createdAt: now,
    updatedAt: now,
  };
  db.prepare(`
    INSERT INTO equipment (id, name, model, category, icon, specs, imagePath, brochureUrl, stockUrl, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(...rowParams(item));
  return item;
}

function update(id, data) {
  const existing = get(id);
  if (!existing) return null;

  const updated = {
    ...existing,
    name: data.name ?? existing.name,
    model: data.model ?? existing.model,
    category: data.category ?? existing.category,
    icon: data.icon ?? existing.icon,
    specs: data.specs ?? existing.specs,
    brochureUrl: data.brochureUrl !== undefined ? data.brochureUrl : existing.brochureUrl,
    stockUrl: data.stockUrl !== undefined ? data.stockUrl : existing.stockUrl,
    imagePath: data.imagePath !== undefined ? data.imagePath : existing.imagePath,
    updatedAt: new Date().toISOString(),
  };
  db.prepare(`
    UPDATE equipment
    SET name = ?, model = ?, category = ?, icon = ?, specs = ?, imagePath = ?, brochureUrl = ?, stockUrl = ?, updatedAt = ?
    WHERE id = ?
  `).run(
    updated.name,
    updated.model,
    updated.category,
    updated.icon,
    JSON.stringify(updated.specs),
    updated.imagePath,
    updated.brochureUrl,
    updated.stockUrl,
    updated.updatedAt,
    id
  );
  return updated;
}

function remove(id) {
  const result = db.prepare("DELETE FROM equipment WHERE id = ?").run(id);
  return result.changes > 0;
}

module.exports = { list, get, create, update, remove };
