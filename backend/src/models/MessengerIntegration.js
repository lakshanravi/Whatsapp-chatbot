const crypto = require("crypto");
const mongoose = require("mongoose");
const config = require("../config");

const ALGORITHM = "aes-256-gcm";

function encryptionKey() {
  if (!config.messengerTokenEncryptionKey) {
    throw new Error("Missing Messenger token encryption key");
  }
  return crypto.scryptSync(config.messengerTokenEncryptionKey, "messenger-page-token", 32);
}

function encrypt(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(value), "utf8"), cipher.final()]);
  return {
    encryptedPageAccessToken: encrypted.toString("base64"),
    pageAccessTokenIv: iv.toString("base64"),
    pageAccessTokenAuthTag: cipher.getAuthTag().toString("base64"),
    pageAccessTokenLast4: String(value).slice(-4),
  };
}

const schema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true, unique: true },
    pageId: { type: String, required: true, unique: true, trim: true, index: true },
    pageName: { type: String, default: "", trim: true },
    encryptedPageAccessToken: { type: String, required: true, select: false },
    pageAccessTokenIv: { type: String, required: true, select: false },
    pageAccessTokenAuthTag: { type: String, required: true, select: false },
    pageAccessTokenLast4: { type: String, default: "" },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

schema.methods.setPageAccessToken = function setPageAccessToken(token) {
  if (!String(token || "").trim()) throw new Error("Messenger Page access token is required");
  Object.assign(this, encrypt(String(token).trim()));
};

schema.methods.getPageAccessToken = function getPageAccessToken() {
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    encryptionKey(),
    Buffer.from(this.pageAccessTokenIv, "base64")
  );
  decipher.setAuthTag(Buffer.from(this.pageAccessTokenAuthTag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(this.encryptedPageAccessToken, "base64")),
    decipher.final(),
  ]).toString("utf8");
};

schema.methods.toSafeJSON = function toSafeJSON() {
  return {
    _id: this._id,
    companyId: this.companyId,
    pageId: this.pageId,
    pageName: this.pageName,
    pageAccessTokenLast4: this.pageAccessTokenLast4,
    hasPageAccessToken: Boolean(this.encryptedPageAccessToken || this.pageAccessTokenLast4),
    isActive: this.isActive,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

module.exports = mongoose.models.MessengerIntegration || mongoose.model("MessengerIntegration", schema);
