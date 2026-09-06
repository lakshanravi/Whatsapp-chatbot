const express = require("express");
const fs = require("fs");
const os = require("os");
const path = require("path");
const multer = require("multer");

const { requireSuperAdmin } = require("../middleware/auth");
const { createBackup, restoreBackup } = require("../services/backup");

const router = express.Router();
let activeOperation = null;
let lastRestore = null;
const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: Number(process.env.BACKUP_MAX_UPLOAD_BYTES || 2 * 1024 ** 3) },
  fileFilter: (_req, file, callback) => {
    const valid = path.extname(file.originalname).toLowerCase() === ".zip";
    callback(valid ? null : new Error("Only .zip backup files are allowed"), valid);
  },
});

router.use(requireSuperAdmin);

router.get("/download", async (_req, res, next) => {
  if (activeOperation) return res.status(409).json({ error: `${activeOperation} is already running` });
  activeOperation = "Backup";
  try {
    await createBackup(res);
  } catch (error) {
    if (!res.headersSent) next(error);
    else res.destroy(error);
  } finally {
    activeOperation = null;
  }
});

router.get("/restore-status", (_req, res) => {
  res.set("Cache-Control", "no-store");
  return res.json(lastRestore || { status: "idle" });
});

router.post("/restore", upload.single("backup"), async (req, res, next) => {
  if (!req.file) return res.status(400).json({ error: "A backup ZIP is required" });
  if (req.body.confirm !== "RESTORE") {
    fs.rmSync(req.file.path, { force: true });
    return res.status(400).json({ error: "Type RESTORE to confirm replacement" });
  }
  if (activeOperation) {
    fs.rmSync(req.file.path, { force: true });
    return res.status(409).json({ error: `${activeOperation} is already running` });
  }
  activeOperation = "Restore";
  try {
    const manifest = await restoreBackup(req.file.path);
    lastRestore = {
      status: "completed",
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      backupCreatedAt: manifest.createdAt,
    };
    activeOperation = null;
    return res.json({
      message: "Backup restored, including the existing document index.",
      createdAt: manifest.createdAt,
      collections: manifest.collections.length,
      status: "completed",
    });
  } catch (error) {
    activeOperation = null;
    fs.rmSync(req.file.path, { force: true });
    return next(error);
  }
});

module.exports = router;
