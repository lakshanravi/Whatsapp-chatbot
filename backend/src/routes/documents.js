const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const { v4: uuidv4 } = require("uuid");

const config = require("../config");
const Company = require("../models/Company");
const Document = require("../models/Document");
const ragClient = require("../services/ragClient");
const { documentKey, hashFile } = require("../services/documentIdentity");
const { canAccessCompany } = require("../middleware/auth");

const router = express.Router({ mergeParams: true });

router.use(canAccessCompany);

function companyUploadDir(companyId) {
  const dir = path.join(config.uploadDir, companyId.toString());
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    cb(null, companyUploadDir(req.params.companyId));
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${uuidv4()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "application/pdf") {
      cb(null, true);
    } else {
      cb(new Error("Only PDF files are allowed"));
    }
  },
});

function normalizeRelativeName(value) {
  const normalized = String(value || "")
    .replace(/\\/g, "/")
    .split("/")
    .filter((part) => part && part !== "." && part !== "..")
    .join("/");

  return normalized || "";
}

function removeUploadedFile(filePath) {
  if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
}

function mediaFromIngest(result) {
  return (result.media || []).map((item) => ({
    fileName: item.file_name,
    pageNumber: item.page_number,
    width: item.width || 0,
    height: item.height || 0,
    mimeType: item.mime_type || "image/png",
    altText: item.alt_text || `Image from PDF page ${item.page_number}`,
    contextText: item.context_text || "",
  }));
}

function removeDocumentMedia(doc) {
  const directory = path.join(path.dirname(doc.filePath), "media", doc._id.toString());
  if (fs.existsSync(directory)) fs.rmSync(directory, { recursive: true, force: true });
}

async function ensureCompany(companyId) {
  return Company.findById(companyId);
}

async function reindexStoredDocument(companyId, doc) {
  if (!fs.existsSync(doc.filePath)) {
    doc.status = "failed";
    doc.indexError = "PDF file missing on disk";
    await doc.save();
    return { ok: false, statusCode: 404, error: doc.indexError, document: doc };
  }

  try {
    const contentHash = await hashFile(doc.filePath);
    const duplicateCandidates = await Document.find({
      _id: { $ne: doc._id },
      companyId,
      contentHash,
    });
    const canonical = [doc, ...duplicateCandidates].sort((left, right) => {
      if (left.isActive !== right.isActive) return left.isActive ? -1 : 1;
      const createdDifference = new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
      return createdDifference || String(left._id).localeCompare(String(right._id));
    })[0];
    const duplicate = String(canonical._id) === String(doc._id) ? null : canonical;
    doc.contentHash = contentHash;
    doc.documentKey = doc.documentKey || documentKey(doc.originalName);
    if (duplicate) {
      doc.isActive = false;
      doc.duplicateOf = duplicate._id;
      doc.status = "indexed";
      doc.indexError = null;
      await doc.save();
      await ragClient.setDocumentActive({
        companyId,
        documentId: doc._id.toString(),
        isActive: false,
      });
      return {
        ok: false,
        skipped: true,
        statusCode: 409,
        error: `Exact duplicate of ${duplicate.originalName}`,
        document: doc,
      };
    }

    doc.duplicateOf = null;
    doc.status = "indexing";
    doc.indexError = null;
    await doc.save();

    const result = await ragClient.ingestDocument({
      companyId,
      documentId: doc._id.toString(),
      filePath: doc.filePath,
      documentName: doc.originalName,
      documentVersion: doc.documentVersion,
      effectiveDate: doc.effectiveDate?.toISOString() || "",
      isActive: doc.isActive,
    });

    doc.status = "indexed";
    doc.chunksIndexed = result.chunks_indexed;
    doc.media = mediaFromIngest(result);
    doc.indexError = null;
    await doc.save();
    return { ok: true, statusCode: 200, document: doc };
  } catch (indexErr) {
    doc.status = "failed";
    doc.indexError = indexErr.response?.data?.detail || indexErr.message;
    await doc.save();
    return {
      ok: false,
      statusCode: indexErr.response?.status || 502,
      error: doc.indexError,
      document: doc,
    };
  }
}

async function createAndIndexDocument(
  company,
  file,
  originalName = file.originalname,
  metadata = {}
) {
  const contentHash = await hashFile(file.path);
  const existingDuplicate = await Document.findOne({
    companyId: company._id,
    contentHash,
  });
  if (existingDuplicate) {
    removeUploadedFile(file.path);
    return {
      ok: false,
      duplicate: true,
      error: "This PDF has already been uploaded",
      document: existingDuplicate,
      detail: `Duplicate of ${existingDuplicate.originalName}`,
    };
  }

  const normalizedKey = documentKey(originalName);
  const doc = await Document.create({
    companyId: company._id,
    originalName,
    fileName: file.filename,
    filePath: path.resolve(file.path),
    mimeType: file.mimetype,
    fileSize: file.size,
    contentHash,
    documentKey: normalizedKey,
    status: "indexing",
    documentVersion: metadata.documentVersion || "1",
    effectiveDate: metadata.effectiveDate || null,
    isActive: metadata.isActive !== false && metadata.isActive !== "false",
  });

  try {
    const result = await ragClient.ingestDocument({
      companyId: company._id.toString(),
      documentId: doc._id.toString(),
      filePath: doc.filePath,
      documentName: doc.originalName,
      documentVersion: doc.documentVersion,
      effectiveDate: doc.effectiveDate?.toISOString() || "",
      isActive: doc.isActive,
    });

    doc.status = "indexed";
    doc.chunksIndexed = result.chunks_indexed;
    doc.media = mediaFromIngest(result);
    await doc.save();

    return { ok: true, document: doc };
  } catch (indexErr) {
    doc.status = "failed";
    doc.indexError = indexErr.response?.data?.detail || indexErr.message;
    await doc.save();

    return {
      ok: false,
      error: "Document saved but indexing failed",
      document: doc,
      detail: doc.indexError,
    };
  }
}

router.post(
  "/",
  upload.fields([
    { name: "files", maxCount: 200 },
    { name: "file", maxCount: 1 },
  ]),
  async (req, res) => {
  try {
    const company = await ensureCompany(req.params.companyId);
    if (!company) {
      return res.status(404).json({ error: "Company not found" });
    }
    const files = [...(req.files?.files || []), ...(req.files?.file || [])];
    if (files.length === 0) {
      return res.status(400).json({ error: "At least one PDF file is required (field: files)" });
    }

    const relativePaths = Array.isArray(req.body.relativePaths)
      ? req.body.relativePaths
      : req.body.relativePaths
        ? [req.body.relativePaths]
        : [];
    const results = [];
    for (const [index, file] of files.entries()) {
      const relativeName = normalizeRelativeName(relativePaths[index]);
      results.push(await createAndIndexDocument(
        company,
        file,
        relativeName || file.originalname,
        {
          documentVersion: req.body.documentVersion,
          effectiveDate: req.body.effectiveDate,
          isActive: req.body.isActive,
        }
      ));
    }

    const failed = results.filter((result) => !result.ok);
    const documents = results.map((result) => result.document);

    if (files.length === 1) {
      const [result] = results;
      if (result.ok) return res.status(201).json(result.document);
      res.status(result.duplicate ? 409 : 502).json({
        error: result.error,
        document: result.document,
        detail: result.detail,
        duplicate: Boolean(result.duplicate),
      });
      return;
    }

    res.status(failed.length ? 207 : 201).json({
      message: failed.length
        ? `${documents.length - failed.length} of ${documents.length} documents uploaded and indexed`
        : `${documents.length} documents uploaded and indexed`,
      documents,
      failed,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/", async (req, res) => {
  try {
    const company = await ensureCompany(req.params.companyId);
    if (!company) {
      return res.status(404).json({ error: "Company not found" });
    }

    const documents = await Document.find({ companyId: company._id }).sort({
      createdAt: -1,
    });
    res.json(documents);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/:documentId/download", async (req, res) => {
  try {
    const doc = await Document.findOne({
      _id: req.params.documentId,
      companyId: req.params.companyId,
    });
    if (!doc) {
      return res.status(404).json({ error: "Document not found" });
    }
    if (!fs.existsSync(doc.filePath)) {
      return res.status(404).json({ error: "Document file not found" });
    }

    res.download(doc.filePath, path.basename(doc.originalName));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/:documentId", async (req, res) => {
  try {
    const doc = await Document.findOne({
      _id: req.params.documentId,
      companyId: req.params.companyId,
    });
    if (!doc) {
      return res.status(404).json({ error: "Document not found" });
    }
    res.json(doc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/all", async (req, res) => {
  try {
    const documents = await Document.find({ companyId: req.params.companyId });

    for (const doc of documents) {
      try {
        await ragClient.deleteDocumentVectors({
          companyId: req.params.companyId,
          documentId: doc._id.toString(),
        });
      } catch (ragErr) {
        console.warn(`RAG delete warning for ${doc._id}:`, ragErr.message);
      }
      if (fs.existsSync(doc.filePath)) {
        fs.unlinkSync(doc.filePath);
      }
      removeDocumentMedia(doc);
    }

    await Document.deleteMany({ companyId: req.params.companyId });
    res.json({
      message: `${documents.length} document${documents.length === 1 ? "" : "s"} deleted`,
      deletedCount: documents.length,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/bulk", async (req, res) => {
  try {
    const documentIds = Array.from(new Set(
      (Array.isArray(req.body.documentIds) ? req.body.documentIds : [])
        .map((id) => String(id || "").trim())
        .filter(Boolean)
    ));
    if (documentIds.length === 0) {
      return res.status(400).json({ error: "At least one document ID is required" });
    }
    const documents = await Document.find({
      _id: { $in: documentIds },
      companyId: req.params.companyId,
    });

    for (const doc of documents) {
      try {
        await ragClient.deleteDocumentVectors({
          companyId: req.params.companyId,
          documentId: doc._id.toString(),
        });
      } catch (ragErr) {
        console.warn(`RAG delete warning for ${doc._id}:`, ragErr.message);
      }
      if (fs.existsSync(doc.filePath)) {
        fs.unlinkSync(doc.filePath);
      }
      removeDocumentMedia(doc);
    }

    await Document.deleteMany({
      _id: { $in: documents.map((doc) => doc._id) },
      companyId: req.params.companyId,
    });

    res.json({
      message: `${documents.length} document${documents.length === 1 ? "" : "s"} deleted`,
      deletedCount: documents.length,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/:documentId", async (req, res) => {
  try {
    const doc = await Document.findOne({
      _id: req.params.documentId,
      companyId: req.params.companyId,
    });
    if (!doc) {
      return res.status(404).json({ error: "Document not found" });
    }

    try {
      await ragClient.deleteDocumentVectors({
        companyId: req.params.companyId,
        documentId: doc._id.toString(),
      });
    } catch (ragErr) {
      console.warn("RAG delete warning:", ragErr.message);
    }

    if (fs.existsSync(doc.filePath)) {
      fs.unlinkSync(doc.filePath);
    }
    removeDocumentMedia(doc);

    await doc.deleteOne();
    res.json({ message: "Document deleted", documentId: req.params.documentId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch("/:documentId/active", async (req, res) => {
  try {
    if (typeof req.body.isActive !== "boolean") {
      return res.status(400).json({ error: "isActive must be a boolean" });
    }
    const doc = await Document.findOne({
      _id: req.params.documentId,
      companyId: req.params.companyId,
    });
    if (!doc) return res.status(404).json({ error: "Document not found" });
    if (req.body.isActive && doc.duplicateOf) {
      return res.status(409).json({ error: "An exact duplicate cannot be activated" });
    }
    doc.documentKey = doc.documentKey || documentKey(doc.originalName);

    await ragClient.setDocumentActive({
      companyId: req.params.companyId,
      documentId: doc._id.toString(),
      isActive: req.body.isActive,
    });
    doc.isActive = req.body.isActive;
    await doc.save();
    return res.json(doc);
  } catch (err) {
    return res.status(err.response?.status || 500).json({
      error: err.response?.data?.detail || err.message,
    });
  }
});

router.post("/reindex-all", async (req, res) => {
  try {
    const documents = await Document.find({ companyId: req.params.companyId }).sort({
      createdAt: 1,
    });
    const results = [];
    for (const doc of documents) {
      const result = await reindexStoredDocument(req.params.companyId, doc);
      results.push({
        documentId: doc._id.toString(),
        documentName: doc.originalName,
        status: result.ok ? "indexed" : result.skipped ? "skipped" : "failed",
        chunksIndexed: result.document.chunksIndexed || 0,
        error: result.error || "",
      });
    }

    const indexedCount = results.filter((item) => item.status === "indexed").length;
    const skippedCount = results.filter((item) => item.status === "skipped").length;
    const failedCount = results.filter((item) => item.status === "failed").length;
    return res.json({
      message: `${indexedCount} of ${documents.length} documents reindexed`,
      total: documents.length,
      indexedCount,
      skippedCount,
      failedCount,
      results,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.post("/:documentId/reindex", async (req, res) => {
  try {
    const doc = await Document.findOne({
      _id: req.params.documentId,
      companyId: req.params.companyId,
    });
    if (!doc) return res.status(404).json({ error: "Document not found" });

    const result = await reindexStoredDocument(req.params.companyId, doc);
    if (result.ok) return res.json(result.document);
    return res.status(result.statusCode).json({
      error: result.skipped ? result.error : "Reindex failed",
      detail: result.error,
      duplicate: Boolean(result.skipped),
      document: result.document,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
