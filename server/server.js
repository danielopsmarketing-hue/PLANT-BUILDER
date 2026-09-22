const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const db = require("./db");
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

// ---------- Equipment ----------

app.get("/api/equipment", (req, res) => {
  res.json(db.list());
});

app.get("/api/equipment/:id", (req, res) => {
  const item = db.get(req.params.id);
  if (!item) return res.status(404).json({ error: "Not found" });
  res.json(item);
});

app.post("/api/equipment", upload.single("image"), (req, res) => {
  const { name, model, category, icon, brochureUrl } = req.body;
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
    imagePath: req.file ? `/uploads/${req.file.filename}` : null,
  });
  res.status(201).json(item);
});

app.put("/api/equipment/:id", upload.single("image"), (req, res) => {
  const existing = db.get(req.params.id);
  if (!existing) {
    if (req.file) removeUploadedFile(req.file.filename);
    return res.status(404).json({ error: "Not found" });
  }

  const { name, model, category, icon, brochureUrl, removeImage } = req.body;
  const data = {
    name,
    model,
    category,
    icon,
    specs: req.body.specs !== undefined ? parseSpecs(req.body.specs) : undefined,
    brochureUrl: brochureUrl !== undefined ? (brochureUrl || null) : undefined,
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

app.delete("/api/equipment/:id", (req, res) => {
  const existing = db.get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Not found" });
  if (existing.imagePath) removeUploadedFile(existing.imagePath);
  db.remove(req.params.id);
  res.status(204).end();
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(400).json({ error: err.message || "Unexpected error" });
});

app.listen(PORT, () => {
  console.log(`Plant Builder server listening on http://localhost:${PORT}`);
});
