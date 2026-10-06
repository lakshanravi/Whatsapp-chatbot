const mongoose = require("mongoose");

const documentMediaSchema = new mongoose.Schema(
  {
    fileName: { type: String, required: true },
    pageNumber: { type: Number, required: true },
    width: { type: Number, default: 0 },
    height: { type: Number, default: 0 },
    mimeType: { type: String, default: "image/png" },
    altText: { type: String, default: "PDF image" },
    contextText: { type: String, default: "" },
  },
  { _id: false }
);

const documentSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      index: true,
    },
    originalName: {
      type: String,
      required: true,
    },
    fileName: {
      type: String,
      required: true,
    },
    filePath: {
      type: String,
      required: true,
    },
    mimeType: {
      type: String,
      default: "application/pdf",
    },
    fileSize: {
      type: Number,
      default: 0,
    },
    contentHash: { type: String, default: "", index: true },
    documentKey: { type: String, default: "", index: true },
    duplicateOf: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Document",
      default: null,
    },
    status: {
      type: String,
      enum: ["pending", "indexing", "indexed", "failed"],
      default: "pending",
    },
    chunksIndexed: {
      type: Number,
      default: 0,
    },
    indexError: {
      type: String,
      default: null,
    },
    documentVersion: { type: String, default: "1" },
    effectiveDate: { type: Date, default: null },
    isActive: { type: Boolean, default: true, index: true },
    media: { type: [documentMediaSchema], default: [] },
  },
  { timestamps: true }
);

documentSchema.index({ companyId: 1, contentHash: 1 });
documentSchema.index({ companyId: 1, documentKey: 1, isActive: 1 });

module.exports = mongoose.model("Document", documentSchema);
