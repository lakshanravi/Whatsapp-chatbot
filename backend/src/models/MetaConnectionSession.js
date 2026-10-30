const crypto = require("crypto");
const mongoose = require("mongoose");
const config = require("../config");

const ALGORITHM = "aes-256-gcm";

function key() {
  const secret = config.messengerTokenEncryptionKey || config.whatsappTokenEncryptionKey;
  if (!secret) throw new Error("Missing Meta connection encryption key");
  return crypto.scryptSync(secret, "meta-connection-session", 32);
}

const schema = new mongoose.Schema({
  connectionId: { type: String, required: true, unique: true, index: true },
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true, index: true },
  provider: { type: String, enum: ["messenger"], required: true },
  encryptedToken: { type: String, required: true, select: false },
  tokenIv: { type: String, required: true, select: false },
  tokenAuthTag: { type: String, required: true, select: false },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
}, { timestamps: true });

schema.methods.setToken = function setToken(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key(), iv);
  const encrypted = Buffer.concat([cipher.update(String(value), "utf8"), cipher.final()]);
  this.encryptedToken = encrypted.toString("base64");
  this.tokenIv = iv.toString("base64");
  this.tokenAuthTag = cipher.getAuthTag().toString("base64");
};

schema.methods.getToken = function getToken() {
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    key(),
    Buffer.from(this.tokenIv, "base64")
  );
  decipher.setAuthTag(Buffer.from(this.tokenAuthTag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(this.encryptedToken, "base64")),
    decipher.final(),
  ]).toString("utf8");
};

module.exports = mongoose.models.MetaConnectionSession
  || mongoose.model("MetaConnectionSession", schema);
