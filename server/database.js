// Shared SQLite connection for the whole app. One database file, one
// connection module — every data-access file (this equipment one now,
// users/plant-projects/etc. in later phases) requires this and creates
// its own table(s) on it via `CREATE TABLE IF NOT EXISTS`, rather than
// each owning a separate .db file. That's the point of splitting this
// out now: adding a `users` or `plant_projects` table later is "create
// another table on the existing connection," not "wire up a second
// database and figure out how the two relate."
//
// Uses Node's built-in node:sqlite (stable without a flag from Node
// 22.5+) — no native module to compile, no DB server to run, same
// zero-dependency shape the original JSON-file store had. Requires
// Node >= 22.5 (see package.json "engines").

const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");

const DATA_DIR = path.join(__dirname, "data");
const DB_FILE = path.join(DATA_DIR, "plantbuilder.db");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(DB_FILE);
db.exec("PRAGMA foreign_keys = ON");

module.exports = { db, DATA_DIR, DB_FILE };
