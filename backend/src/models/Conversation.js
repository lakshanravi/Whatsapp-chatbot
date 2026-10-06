const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    role: {
      type: String,
      enum: ["user", "assistant"],
      required: true,
    },
    content: {
      type: String,
      required: true,
    },
    sources: {
      type: [
        {
          documentId: String,
          documentName: String,
          content: String,
          score: Number,
          pageNumber: Number,
          sectionHeading: String,
        },
      ],
      default: [],
    },
    feedback: {
      type: String,
      enum: ["helpful", "not_helpful", ""],
      default: "",
    },
    diagnostics: {
      type: mongoose.Schema.Types.Mixed,
      default: undefined,
    },
  },
  { _id: false }
);

const conversationSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      index: true,
    },
    sessionId: {
      type: String,
      required: true,
      index: true,
    },
    customerName: { type: String, default: "" },
    customerEmail: { type: String, default: "" },
    customerPhone: { type: String, default: "" },
    customerExternalId: { type: String, default: "", index: true },
    customerAuthProvider: { type: String, default: "", index: true },
    channel: {
      type: String,
      enum: ["web", "sms", "voice", "whatsapp", "messenger"],
      default: "web",
    },
    messages: {
      type: [messageSchema],
      default: [],
    },
    ragContext: {
      productNames: { type: [String], default: [] },
      modelIds: { type: [String], default: [] },
      documentIds: { type: [String], default: [] },
    },
    media: {
      type: [{
        url: String,
        altText: String,
        documentId: String,
        documentName: String,
        pageNumber: Number,
        mimeType: String,
      }],
      default: [],
    },
    preferredLanguage: {
      type: String,
      enum: ["", "en", "si", "ta"],
      default: "",
      index: true,
    },
    commerceState: {
      stage: { type: String, default: "browsing" },
      draft: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
      updatedAt: { type: Date, default: Date.now },
    },
  },
  { timestamps: true }
);

conversationSchema.index({ companyId: 1, sessionId: 1 }, { unique: true });

module.exports = mongoose.model("Conversation", conversationSchema);
