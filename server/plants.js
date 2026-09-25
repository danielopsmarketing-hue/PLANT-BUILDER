// Saved plant projects -- on the shared SQLite connection, separate from
// auth.js (who you are) and db.js (the equipment catalog). A project's
// `data` column is the same JSON shape the Builder already saves to
// localStorage (nodes/connectors/shapes/lines) -- app.js barely changes
// to move from one persistence backend to the other.

const crypto = require("crypto");
const { db } = require("./database");

db.exec(`
  CREATE TABLE IF NOT EXISTS plant_projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    ownerId TEXT NOT NULL REFERENCES users(id),
    createdBy TEXT NOT NULL REFERENCES users(id),
    updatedBy TEXT NOT NULL REFERENCES users(id),
    status TEXT NOT NULL DEFAULT 'active',
    version INTEGER NOT NULL DEFAULT 1,
    thumbnail TEXT,
    data TEXT NOT NULL DEFAULT '{}',
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL,
    lastOpenedAt TEXT
  )
`);

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function rowToSummary(row) {
  const { id, name, ownerId, status, version, thumbnail, createdAt, updatedAt, lastOpenedAt } = row;
  return { id, name, ownerId, status, version, thumbnail, createdAt, updatedAt, lastOpenedAt };
}

function rowToFull(row) {
  if (!row) return null;
  return { ...rowToSummary(row), createdBy: row.createdBy, updatedBy: row.updatedBy, data: JSON.parse(row.data) };
}

// Owned plants only -- cross-user visibility (Admin/Manager "All Plants")
// is a separate, explicitly-scoped-later capability (Phase 6b), not
// bolted on here.
function listForUser(userId) {
  return db
    .prepare("SELECT * FROM plant_projects WHERE ownerId = ? AND status = 'active' ORDER BY updatedAt DESC")
    .all(userId)
    .map(rowToSummary);
}

function listAll() {
  return db
    .prepare(`
      SELECT p.*, u.firstName AS ownerFirstName, u.lastName AS ownerLastName
      FROM plant_projects p JOIN users u ON u.id = p.ownerId
      WHERE p.status = 'active'
      ORDER BY p.updatedAt DESC
    `)
    .all()
    .map((row) => ({ ...rowToSummary(row), ownerName: `${row.ownerFirstName} ${row.ownerLastName}` }));
}

function getForUser(id, userId) {
  const row = db.prepare("SELECT * FROM plant_projects WHERE id = ?").get(id);
  if (!row || row.status !== "active") return null;
  if (row.ownerId !== userId) return null; // 6b's admin/manager override is a separate call, not this one
  db.prepare("UPDATE plant_projects SET lastOpenedAt = ? WHERE id = ?").run(new Date().toISOString(), id);
  return rowToFull({ ...row, lastOpenedAt: new Date().toISOString() });
}

function create(userId, { name, data }) {
  if (!name || !name.trim()) throw new HttpError(400, "name is required");
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  db.prepare(`
    INSERT INTO plant_projects (id, name, ownerId, createdBy, updatedBy, data, createdAt, updatedAt, lastOpenedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, name.trim(), userId, userId, userId, JSON.stringify(data || {}), now, now, now);
  return rowToFull(db.prepare("SELECT * FROM plant_projects WHERE id = ?").get(id));
}

function update(id, userId, { name, data }) {
  const existing = db.prepare("SELECT * FROM plant_projects WHERE id = ?").get(id);
  if (!existing || existing.status !== "active") throw new HttpError(404, "Plant not found");
  if (existing.ownerId !== userId) throw new HttpError(403, "You don't own this plant");

  const now = new Date().toISOString();
  const nextName = name !== undefined ? name.trim() : existing.name;
  const nextData = data !== undefined ? JSON.stringify(data) : existing.data;
  db.prepare(`
    UPDATE plant_projects SET name = ?, data = ?, updatedBy = ?, version = version + 1, updatedAt = ?
    WHERE id = ?
  `).run(nextName, nextData, userId, now, id);
  return rowToFull(db.prepare("SELECT * FROM plant_projects WHERE id = ?").get(id));
}

function duplicate(id, userId) {
  const existing = db.prepare("SELECT * FROM plant_projects WHERE id = ?").get(id);
  if (!existing || existing.status !== "active") throw new HttpError(404, "Plant not found");
  if (existing.ownerId !== userId) throw new HttpError(403, "You don't own this plant");
  return create(userId, { name: `${existing.name} (copy)`, data: JSON.parse(existing.data) });
}

function rename(id, userId, name) {
  return update(id, userId, { name });
}

function remove(id, userId) {
  const existing = db.prepare("SELECT * FROM plant_projects WHERE id = ?").get(id);
  if (!existing || existing.status !== "active") throw new HttpError(404, "Plant not found");
  if (existing.ownerId !== userId) throw new HttpError(403, "You don't own this plant");
  // Soft delete: ownership/history stays intact (matches the "don't erase
  // ownership history" principle already applied to user deactivation).
  db.prepare("UPDATE plant_projects SET status = 'deleted', updatedAt = ? WHERE id = ?").run(new Date().toISOString(), id);
}

module.exports = { listForUser, listAll, getForUser, create, update, duplicate, rename, remove, HttpError };
