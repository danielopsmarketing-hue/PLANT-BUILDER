// User accounts, roles, sessions, and invitations -- on the shared SQLite
// connection (see database.js), deliberately separate from db.js
// (equipment) and from any future plant-project module: authentication,
// authorization, and plant data are three different concerns and this
// file only owns the first two.
//
// No new dependency for any of this: password hashing uses Node's
// built-in crypto.scrypt (an established, OWASP-recommended KDF already
// in core, not a custom mechanism), and sessions are an opaque random
// token in an httpOnly cookie, hand-rolled because reading/writing one
// cookie is a few lines of string formatting, not a security primitive
// worth a dependency. Same zero-new-native-dependency shape as the
// Phase 2a SQLite migration.

const crypto = require("crypto");
const { db } = require("./database");

const ROLES = ["admin", "manager", "staff"];
const STATUSES = ["invited", "active", "inactive"];

const SESSION_COOKIE = "pb_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days -- an internal tool, staff stay logged in
const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    firstName TEXT NOT NULL,
    lastName TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    passwordHash TEXT,
    role TEXT NOT NULL DEFAULT 'staff',
    status TEXT NOT NULL DEFAULT 'invited',
    invitationTokenHash TEXT,
    invitationExpiresAt TEXT,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL,
    lastLoginAt TEXT
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    createdAt TEXT NOT NULL,
    expiresAt TEXT NOT NULL
  )
`);

ensureBootstrapAdmin();

// ---------- Password hashing (scrypt, no dependency) ----------

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

function verifyPassword(password, stored) {
  if (!stored) return false;
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const actual = crypto.scryptSync(password, salt, 64);
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

// Dummy hash so a login against an unknown email takes roughly the same
// time as one against a real user -- a cheap guard against timing-based
// account enumeration, not a claim this is a hardened public-facing login.
const DUMMY_HASH = hashPassword(crypto.randomBytes(24).toString("hex"));

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function randomToken() {
  return crypto.randomBytes(32).toString("hex");
}

function hashToken(rawToken) {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

// ---------- Row <-> user mapping ----------

function rowToUser(row) {
  if (!row) return null;
  return { ...row };
}

// Fields safe to ever send to a client -- never passwordHash or
// invitationTokenHash.
function toSafeUser(user) {
  if (!user) return null;
  const { id, firstName, lastName, email, role, status, createdAt, updatedAt, lastLoginAt } = user;
  return { id, firstName, lastName, email, role, status, createdAt, updatedAt, lastLoginAt };
}

function findUserByEmail(email) {
  return rowToUser(db.prepare("SELECT * FROM users WHERE email = ?").get(normalizeEmail(email)));
}

function findUserById(id) {
  return rowToUser(db.prepare("SELECT * FROM users WHERE id = ?").get(id));
}

function listUsers() {
  return db
    .prepare("SELECT id, firstName, lastName, email, role, status, createdAt, updatedAt, lastLoginAt FROM users ORDER BY createdAt")
    .all()
    .map(rowToUser);
}

function countActiveAdmins(excludingId) {
  const rows = db.prepare("SELECT id FROM users WHERE role = 'admin' AND status = 'active'").all();
  return rows.filter((r) => r.id !== excludingId).length;
}

// ---------- Bootstrap ----------
//
// Admins are created by admins, so the very first one can't be -- on an
// empty users table, seed one from env vars (or a generated one-time
// password, printed once) so a fresh environment is actually usable
// without a manual DB-editing step.
function ensureBootstrapAdmin() {
  const { count } = db.prepare("SELECT COUNT(*) AS count FROM users").get();
  if (count > 0) return;

  const email = normalizeEmail(process.env.BOOTSTRAP_ADMIN_EMAIL || "admin@plantbuilder.local");
  const generatedPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD ? null : crypto.randomBytes(9).toString("base64url");
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD || generatedPassword;
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO users (id, firstName, lastName, email, passwordHash, role, status, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, 'admin', 'active', ?, ?)
  `).run(crypto.randomUUID(), "Admin", "User", email, hashPassword(password), now, now);

  console.log("========================================================");
  console.log("Bootstrap admin account created (users table was empty):");
  console.log(`  email:    ${email}`);
  if (generatedPassword) {
    console.log(`  password: ${generatedPassword}  (generated -- log in and change it)`);
  } else {
    console.log("  password: (from BOOTSTRAP_ADMIN_PASSWORD)");
  }
  console.log("========================================================");
}

// ---------- Users: create (invite) / update ----------

function inviteUser({ firstName, lastName, email, role }) {
  const normalizedEmail = normalizeEmail(email);
  if (!firstName || !lastName || !normalizedEmail) {
    throw new HttpError(400, "firstName, lastName, and email are required");
  }
  if (!ROLES.includes(role)) {
    throw new HttpError(400, `role must be one of: ${ROLES.join(", ")}`);
  }
  if (findUserByEmail(normalizedEmail)) {
    throw new HttpError(409, "A user with this email already exists");
  }

  const rawToken = randomToken();
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + INVITATION_TTL_MS).toISOString();
  const id = crypto.randomUUID();

  db.prepare(`
    INSERT INTO users (id, firstName, lastName, email, role, status, invitationTokenHash, invitationExpiresAt, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, 'invited', ?, ?, ?, ?)
  `).run(id, firstName, lastName, normalizedEmail, role, hashToken(rawToken), expiresAt, now, now);

  return { user: findUserById(id), rawInvitationToken: rawToken };
}

function getInvitation(rawToken) {
  if (!rawToken) return null;
  const tokenHash = hashToken(rawToken);
  const user = rowToUser(db.prepare("SELECT * FROM users WHERE invitationTokenHash = ? AND status = 'invited'").get(tokenHash));
  if (!user) return null;
  if (new Date(user.invitationExpiresAt).getTime() < Date.now()) return null;
  return user;
}

function acceptInvitation(rawToken, password) {
  const user = getInvitation(rawToken);
  if (!user) throw new HttpError(400, "This invitation link is invalid or has expired");
  if (!password || password.length < 8) throw new HttpError(400, "Password must be at least 8 characters");

  const now = new Date().toISOString();
  db.prepare(`
    UPDATE users
    SET passwordHash = ?, status = 'active', invitationTokenHash = NULL, invitationExpiresAt = NULL, updatedAt = ?
    WHERE id = ?
  `).run(hashPassword(password), now, user.id);

  return findUserById(user.id);
}

// role/status update -- guards against locking everyone out by
// deactivating or demoting the last active admin.
function updateUser(id, { role, status }) {
  const existing = findUserById(id);
  if (!existing) throw new HttpError(404, "User not found");
  if (role !== undefined && !ROLES.includes(role)) throw new HttpError(400, `role must be one of: ${ROLES.join(", ")}`);
  if (status !== undefined && !STATUSES.includes(status)) throw new HttpError(400, `status must be one of: ${STATUSES.join(", ")}`);

  const nextRole = role !== undefined ? role : existing.role;
  const nextStatus = status !== undefined ? status : existing.status;
  const wasActiveAdmin = existing.role === "admin" && existing.status === "active";
  const willBeActiveAdmin = nextRole === "admin" && nextStatus === "active";
  if (wasActiveAdmin && !willBeActiveAdmin && countActiveAdmins(id) === 0) {
    throw new HttpError(400, "Can't remove the last active admin");
  }

  const now = new Date().toISOString();
  db.prepare("UPDATE users SET role = ?, status = ?, updatedAt = ? WHERE id = ?").run(nextRole, nextStatus, now, id);
  return findUserById(id);
}

function changePassword(userId, currentPassword, newPassword) {
  const user = findUserById(userId);
  if (!user || !verifyPassword(currentPassword, user.passwordHash)) {
    throw new HttpError(401, "Current password is incorrect");
  }
  if (!newPassword || newPassword.length < 8) throw new HttpError(400, "Password must be at least 8 characters");

  const now = new Date().toISOString();
  db.prepare("UPDATE users SET passwordHash = ?, updatedAt = ? WHERE id = ?").run(hashPassword(newPassword), now, userId);
}

// ---------- Login / sessions ----------

function verifyLogin(email, password) {
  const user = findUserByEmail(email);
  if (!user) {
    verifyPassword(password, DUMMY_HASH); // keep timing similar to a real user
    return null;
  }
  if (!verifyPassword(password, user.passwordHash)) return null;
  if (user.status !== "active") return null;
  return user;
}

function createSession(userId) {
  const rawToken = randomToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  db.prepare("INSERT INTO sessions (id, userId, createdAt, expiresAt) VALUES (?, ?, ?, ?)").run(
    hashToken(rawToken),
    userId,
    now.toISOString(),
    expiresAt.toISOString()
  );
  db.prepare("UPDATE users SET lastLoginAt = ? WHERE id = ?").run(now.toISOString(), userId);
  return rawToken;
}

function getSessionUser(rawToken) {
  if (!rawToken) return null;
  const tokenHash = hashToken(rawToken);
  const session = db.prepare("SELECT * FROM sessions WHERE id = ?").get(tokenHash);
  if (!session) return null;
  if (new Date(session.expiresAt).getTime() < Date.now()) {
    db.prepare("DELETE FROM sessions WHERE id = ?").run(tokenHash);
    return null;
  }
  const user = findUserById(session.userId);
  // Re-checked on every request, not just at login: a deactivated user's
  // existing session stops working immediately, it doesn't wait for expiry.
  if (!user || user.status !== "active") return null;
  return user;
}

function deleteSession(rawToken) {
  if (!rawToken) return;
  db.prepare("DELETE FROM sessions WHERE id = ?").run(hashToken(rawToken));
}

// ---------- Cookies (hand-rolled: string formatting, not a security primitive) ----------

function parseCookies(req) {
  const header = req.headers.cookie;
  const cookies = {};
  if (!header) return cookies;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key) cookies[key] = decodeURIComponent(value);
  }
  return cookies;
}

function setSessionCookie(res, rawToken) {
  const maxAgeSeconds = Math.floor(SESSION_TTL_MS / 1000);
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=${encodeURIComponent(rawToken)}; HttpOnly; Path=/; Max-Age=${maxAgeSeconds}; SameSite=Lax${secure}`
  );
}

function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`);
}

// ---------- Middleware ----------

function requireAuth(req, res, next) {
  const cookies = parseCookies(req);
  const user = getSessionUser(cookies[SESSION_COOKIE]);
  if (!user) return res.status(401).json({ error: "Authentication required" });
  req.user = user;
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "Authentication required" });
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: "Insufficient permissions" });
    next();
  };
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

module.exports = {
  ROLES,
  STATUSES,
  SESSION_COOKIE,
  toSafeUser,
  findUserByEmail,
  findUserById,
  listUsers,
  inviteUser,
  getInvitation,
  acceptInvitation,
  updateUser,
  changePassword,
  verifyLogin,
  createSession,
  getSessionUser,
  deleteSession,
  parseCookies,
  setSessionCookie,
  clearSessionCookie,
  requireAuth,
  requireRole,
  HttpError,
};
