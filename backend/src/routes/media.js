const express = require("express");
const fs = require("fs");
const path = require("path");
const Document = require("../models/Document");

const router = express.Router();

router.get("/:companyId/:documentId/:fileName", async (req, res) => {
  try {
    const document = await Document.findOne({
      _id: req.params.documentId,
      companyId: req.params.companyId,
      isActive: true,
    });
    const media = document?.media?.find((item) => item.fileName === req.params.fileName);
    if (!document || !media) return res.status(404).json({ error: "Image not found" });
    const mediaRoot = path.resolve(path.dirname(document.filePath), "media", document._id.toString());
    const filePath = path.resolve(mediaRoot, media.fileName);
    if (!filePath.startsWith(`${mediaRoot}${path.sep}`) || !fs.existsSync(filePath)) {
      return res.status(404).json({ error: "Image file not found" });
    }
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.type(media.mimeType || "image/png");
    return res.sendFile(filePath);
  } catch {
    return res.status(404).json({ error: "Image not found" });
  }
});

module.exports = router;
