const crypto = require("crypto");
const mongoose = require("mongoose");

const config = require("../config");

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const KEY_LENGTH = 32;

function getEncryptionKey() {
  if (!config.whatsappTokenEncryptionKey) {
    throw new Error("Missing WhatsApp token encryption key");
  }

  return crypto.scryptSync(
    config.whatsappTokenEncryptionKey,
    "whatsapp-access-token",
    KEY_LENGTH
  );
}

function encryptToken(token) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getEncryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(String(token), "utf8"),
    cipher.final(),
  ]);

  return {
    encryptedAccessToken: encrypted.toString("base64"),
    accessTokenIv: iv.toString("base64"),
    accessTokenAuthTag: cipher.getAuthTag().toString("base64"),
    accessTokenLast4: String(token).slice(-4),
  };
}

function decryptToken({ encryptedAccessToken, accessTokenIv, accessTokenAuthTag }) {
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    getEncryptionKey(),
    Buffer.from(accessTokenIv, "base64")
  );

  decipher.setAuthTag(Buffer.from(accessTokenAuthTag, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(encryptedAccessToken, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

const whatsAppIntegrationSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      unique: true,
      index: true,
    },
    phoneNumberId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    wabaId: { type: String, default: "", trim: true, index: true },
    displayPhoneNumber: { type: String, default: "", trim: true },
    verifiedName: { type: String, default: "", trim: true },
    onboardingMethod: {
      type: String,
      enum: ["manual", "embedded_signup"],
      default: "manual",
    },
    encryptedAccessToken: {
      type: String,
      required: true,
      select: false,
    },
    accessTokenIv: {
      type: String,
      required: true,
      select: false,
    },
    accessTokenAuthTag: {
      type: String,
      required: true,
      select: false,
    },
    accessTokenLast4: {
      type: String,
      default: "",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

whatsAppIntegrationSchema.methods.setAccessToken = function setAccessToken(token) {
  if (!token || !String(token).trim()) {
    throw new Error("WhatsApp access token is required");
  }

  Object.assign(this, encryptToken(String(token).trim()));
};

whatsAppIntegrationSchema.methods.getAccessToken = function getAccessToken() {
  return decryptToken(this);
};

whatsAppIntegrationSchema.methods.toSafeJSON = function toSafeJSON() {
  return {
    _id: this._id,
    companyId: this.companyId,
    phoneNumberId: this.phoneNumberId,
    wabaId: this.wabaId,
    displayPhoneNumber: this.displayPhoneNumber,
    verifiedName: this.verifiedName,
    onboardingMethod: this.onboardingMethod,
    accessTokenLast4: this.accessTokenLast4,
    hasAccessToken: Boolean(this.encryptedAccessToken || this.accessTokenLast4),
    isActive: this.isActive,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

module.exports = mongoose.model("WhatsAppIntegration", whatsAppIntegrationSchema);
