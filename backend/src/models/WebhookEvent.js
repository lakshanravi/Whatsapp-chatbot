const mongoose = require("mongoose");

const schema = new mongoose.Schema(
  {
    provider: { type: String, enum: ["whatsapp", "messenger", "sms"], required: true },
    eventId: { type: String, required: true },
    receivedAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 30 },
  },
  { versionKey: false }
);

schema.index({ provider: 1, eventId: 1 }, { unique: true });

module.exports = mongoose.models.WebhookEvent || mongoose.model("WebhookEvent", schema);
