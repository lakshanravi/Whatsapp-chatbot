require("dotenv").config();

function parseCsvEnv(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

const config = {
  port: process.env.PORT || 3000,
  mongodbUri: process.env.MONGODB_URI || "mongodb://localhost:27017/rag_chatbot",
  ragServiceUrl: process.env.RAG_SERVICE_URL || "http://localhost:8000",
  ragServiceApiKey: process.env.RAG_SERVICE_API_KEY || "",
  uploadDir: process.env.UPLOAD_DIR || "./uploads",
  jwtSecret: process.env.JWT_SECRET || "change-this-dev-secret",
  superAdminEmail: process.env.SUPER_ADMIN_EMAIL || "admin@example.com",
  superAdminPassword: process.env.SUPER_ADMIN_PASSWORD || "admin123",
  graphApiVersion: process.env.GRAPH_API_VERSION || "v20.0",
  whatsappVerifyToken: process.env.WHATSAPP_VERIFY_TOKEN,
  whatsappAppSecret: process.env.WHATSAPP_APP_SECRET || process.env.MESSENGER_APP_SECRET,
  whatsappTokenEncryptionKey: process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY,
  smsTokenEncryptionKey:
    process.env.SMS_TOKEN_ENCRYPTION_KEY || process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY,
  messengerTokenEncryptionKey:
    process.env.MESSENGER_TOKEN_ENCRYPTION_KEY || process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY,
  messengerVerifyToken: process.env.MESSENGER_VERIFY_TOKEN,
  messengerAppSecret: process.env.MESSENGER_APP_SECRET,
  twilioValidateWebhookSignature:
    process.env.TWILIO_VALIDATE_WEBHOOK_SIGNATURE !== "false",
  publicBackendUrl: process.env.PUBLIC_BACKEND_URL || "",
  openaiApiKey: process.env.OPENAI_API_KEY,
  openaiChatModel: process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini",
  googleClientIds: parseCsvEnv(
    process.env.GOOGLE_CLIENT_IDS || process.env.GOOGLE_CLIENT_ID
  ),
};

config.validateForStartup = function validateForStartup() {
  if (process.env.NODE_ENV !== "production") return;
  const missing = [];
  if (!process.env.JWT_SECRET || config.jwtSecret === "change-this-dev-secret") missing.push("JWT_SECRET");
  if (!process.env.SUPER_ADMIN_PASSWORD || config.superAdminPassword === "admin123") missing.push("SUPER_ADMIN_PASSWORD");
  if (!config.ragServiceApiKey) missing.push("RAG_SERVICE_API_KEY");
  if (missing.length) {
    throw new Error(`Missing secure production configuration: ${missing.join(", ")}`);
  }
};

module.exports = config;
