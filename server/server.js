const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const db = require("./db");
const auth = require("./auth");
const plants = require("./plants");
const ai = require("./ai");
const { CATEGORIES } = require("./seed-data");

const PORT = process.env.PORT || 4000;
const UPLOADS_DIR = path.join(__dirname, "uploads");
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/svg+xml"]);
const EXT_BY_MIME = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/svg+xml": ".svg",
};

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => {
      const ext = EXT_BY_MIME[file.mimetype] || path.extname(file.originalname) || "";
      cb(null, `${crypto.randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_IMAGE_TYPES.has(file.mimetype)) {
      cb(new Error("Unsupported image type. Use PNG, JPEG, WEBP, or SVG."));
      return;
    }
    cb(null, true);
  },
});

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));
app.use("/uploads", express.static(UPLOADS_DIR));

function parseSpecs(raw) {
  if (raw == null) return {};
  if (typeof raw === "object") return raw;
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function removeUploadedFile(imagePath) {
  if (!imagePath) return;
  const filename = path.basename(imagePath);
  const fullPath = path.join(UPLOADS_DIR, filename);
  fs.unlink(fullPath, () => {});
}

// ---------- Categories ----------

app.get("/api/categories", (req, res) => {
  res.json(CATEGORIES);
});

// ---------- Auth ----------
//
// The real per-user account system (Phase 2b). admin.html and the
// equipment write routes below now run on this (requireAuth +
// requireRole("admin")) instead of the old shared-password HTTP Basic
// Auth gate, which is gone as of Phase 6a -- one enforcement mechanism
// for the whole app, not two running in parallel indefinitely.

app.post("/api/auth/login", (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "email and password are required" });
  const user = auth.verifyLogin(email, password);
  if (!user) return res.status(401).json({ error: "Invalid email or password" });
  const token = auth.createSession(user.id);
  auth.setSessionCookie(res, token);
  res.json(auth.toSafeUser(auth.findUserById(user.id)));
});

app.post("/api/auth/logout", (req, res) => {
  const cookies = auth.parseCookies(req);
  auth.deleteSession(cookies[auth.SESSION_COOKIE]);
  auth.clearSessionCookie(res);
  res.status(204).end();
});

app.get("/api/auth/me", auth.requireAuth, (req, res) => {
  res.json(auth.toSafeUser(req.user));
});

app.post("/api/auth/change-password", auth.requireAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  auth.changePassword(req.user.id, currentPassword, newPassword);
  res.status(204).end();
});

// Public: an invitee isn't logged in yet, so these can't sit behind requireAuth.
app.get("/api/auth/invitation/:token", (req, res) => {
  const user = auth.getInvitation(req.params.token);
  if (!user) return res.status(404).json({ error: "This invitation link is invalid or has expired" });
  res.json({ firstName: user.firstName, lastName: user.lastName, email: user.email });
});

app.post("/api/auth/invitation/:token/accept", (req, res) => {
  const { password } = req.body || {};
  const user = auth.acceptInvitation(req.params.token, password);
  const token = auth.createSession(user.id);
  auth.setSessionCookie(res, token);
  res.json(auth.toSafeUser(user));
});

// ---------- Users (admin-only) ----------

app.get("/api/users", auth.requireAuth, auth.requireRole("admin"), (req, res) => {
  res.json(auth.listUsers());
});

app.post("/api/users", auth.requireAuth, auth.requireRole("admin"), (req, res) => {
  const { firstName, lastName, email, role } = req.body || {};
  const { user, rawInvitationToken } = auth.inviteUser({ firstName, lastName, email, role });
  res.status(201).json({
    user: auth.toSafeUser(user),
    // The actual page the invitee visits (set-password.js calls the
    // /api/auth/invitation/:token API itself) -- an admin copies this
    // and sends it manually, per this phase's explicit "no transactional
    // email yet" scope.
    invitationLink: `${req.protocol}://${req.get("host")}/set-password.html?token=${rawInvitationToken}`,
  });
});

app.patch("/api/users/:id", auth.requireAuth, auth.requireRole("admin"), (req, res) => {
  const { role, status } = req.body || {};
  const user = auth.updateUser(req.params.id, { role, status });
  res.json(auth.toSafeUser(user));
});

// ---------- Plant projects (Phase 2d/2e) ----------
//
// Owner-only for now -- the Admin/Manager "see everyone's plants" view
// is a separate, explicitly later capability (Phase 6b's /api/plants/all),
// not folded in here.

app.get("/api/plants", auth.requireAuth, (req, res) => {
  res.json(plants.listForUser(req.user.id));
});

app.post("/api/plants", auth.requireAuth, (req, res) => {
  const { name, data } = req.body || {};
  res.status(201).json(plants.create(req.user.id, { name, data }));
});

app.get("/api/plants/:id", auth.requireAuth, (req, res) => {
  const plant = plants.getForUser(req.params.id, req.user.id);
  if (!plant) return res.status(404).json({ error: "Not found" });
  res.json(plant);
});

app.put("/api/plants/:id", auth.requireAuth, (req, res) => {
  const { name, data } = req.body || {};
  res.json(plants.update(req.params.id, req.user.id, { name, data }));
});

app.patch("/api/plants/:id", auth.requireAuth, (req, res) => {
  const { name } = req.body || {};
  res.json(plants.rename(req.params.id, req.user.id, name));
});

app.post("/api/plants/:id/duplicate", auth.requireAuth, (req, res) => {
  res.status(201).json(plants.duplicate(req.params.id, req.user.id));
});

app.delete("/api/plants/:id", auth.requireAuth, (req, res) => {
  plants.remove(req.params.id, req.user.id);
  res.status(204).end();
});

app.get("/api/plants-all", auth.requireAuth, auth.requireRole("admin", "manager"), (req, res) => {
  res.json(plants.listAll());
});

// ---------- Equipment ----------

app.get("/api/equipment", (req, res) => {
  res.json(db.list());
});

// Placed before /api/equipment/:id so the literal "search" path isn't
// swallowed by the :id param route. The one lookup tool the AI plant-input
// pipeline (Phase 5) is allowed to use -- it can only place equipment this
// returns, never invent something not in the catalog.
app.get("/api/equipment/search", auth.requireAuth, (req, res) => {
  const { q, category, limit } = req.query;
  const parsedLimit = Number.parseInt(limit, 10);
  res.json(db.search(q, {
    category: category || undefined,
    limit: Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 25) : undefined,
  }));
});

app.get("/api/equipment/:id", (req, res) => {
  const item = db.get(req.params.id);
  if (!item) return res.status(404).json({ error: "Not found" });
  res.json(item);
});

// ---------- AI plant input (Phase 5c/5d) ----------
//
// Stub planner (see ai.js) -- keyword/phrase matching against the real
// catalog via search_equipment, not a real language model. Kept behind
// auth like the rest of the Builder's write surface even though it's
// read-only against the catalog, since it's part of the same session-
// gated feature.
app.post("/api/ai/plan", auth.requireAuth, (req, res) => {
  const prompt = typeof req.body?.prompt === "string" ? req.body.prompt : "";
  if (!prompt.trim()) return res.status(400).json({ error: "prompt is required" });
  res.json(ai.planFromPrompt(prompt));
});

app.post("/api/equipment", auth.requireAuth, auth.requireRole("admin"), upload.single("image"), (req, res) => {
  const { name, model, category, icon, brochureUrl, stockUrl } = req.body;
  if (!name || !category) {
    if (req.file) removeUploadedFile(req.file.filename);
    return res.status(400).json({ error: "name and category are required" });
  }
  const item = db.create({
    name,
    model,
    category,
    icon,
    specs: parseSpecs(req.body.specs),
    brochureUrl: brochureUrl || null,
    stockUrl: stockUrl || null,
    imagePath: req.file ? `/uploads/${req.file.filename}` : null,
  });
  res.status(201).json(item);
});

app.put("/api/equipment/:id", auth.requireAuth, auth.requireRole("admin"), upload.single("image"), (req, res) => {
  const existing = db.get(req.params.id);
  if (!existing) {
    if (req.file) removeUploadedFile(req.file.filename);
    return res.status(404).json({ error: "Not found" });
  }

  const { name, model, category, icon, brochureUrl, stockUrl, removeImage } = req.body;
  const data = {
    name,
    model,
    category,
    icon,
    specs: req.body.specs !== undefined ? parseSpecs(req.body.specs) : undefined,
    brochureUrl: brochureUrl !== undefined ? (brochureUrl || null) : undefined,
    stockUrl: stockUrl !== undefined ? (stockUrl || null) : undefined,
  };

  if (req.file) {
    if (existing.imagePath) removeUploadedFile(existing.imagePath);
    data.imagePath = `/uploads/${req.file.filename}`;
  } else if (removeImage === "true") {
    if (existing.imagePath) removeUploadedFile(existing.imagePath);
    data.imagePath = null;
  }

  const updated = db.update(req.params.id, data);
  res.json(updated);
});

app.delete("/api/equipment/:id", auth.requireAuth, auth.requireRole("admin"), (req, res) => {
  const existing = db.get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Not found" });
  if (existing.imagePath) removeUploadedFile(existing.imagePath);
  db.remove(req.params.id);
  res.status(204).end();
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 400).json({ error: err.message || "Unexpected error" });
});

app.listen(PORT, () => {
  console.log(`Plant Builder server listening on http://localhost:${PORT}`);
});
