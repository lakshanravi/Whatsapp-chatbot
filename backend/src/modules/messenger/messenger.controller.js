const crypto = require("crypto");
const config = require("../../config");
const WebhookEvent = require("../../models/WebhookEvent");
const { mapIncomingWebhook } = require("./messenger.mapper");
const messengerService = require("./messenger.service");

function verifyWebhook(req, res) {
  if (
    req.query["hub.mode"] === "subscribe"
    && config.messengerVerifyToken
    && req.query["hub.verify_token"] === config.messengerVerifyToken
  ) {
    return res.status(200).send(req.query["hub.challenge"]);
  }
  return res.sendStatus(403);
}

function validSignature(req) {
  if (!config.messengerAppSecret) return false;
  const header = String(req.headers["x-hub-signature-256"] || "");
  const provided = header.startsWith("sha256=") ? header.slice(7) : "";
  const expected = crypto
    .createHmac("sha256", config.messengerAppSecret)
    .update(req.rawBody || Buffer.from(""))
    .digest("hex");
  return provided.length === expected.length
    && crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}

async function receiveWebhook(req, res) {
  if (!validSignature(req)) return res.status(403).json({ error: "Invalid Messenger signature" });
  const messages = mapIncomingWebhook(req.body);
  res.sendStatus(200);
  for (const message of messages) {
    try {
      if (message.messageId) {
        await WebhookEvent.create({ provider: "messenger", eventId: message.messageId });
      }
      await messengerService.replyToMessage(message);
    } catch (error) {
      if (error.code !== 11000) console.error("Messenger webhook processing failed:", error.message);
    }
  }
}

module.exports = { receiveWebhook, verifyWebhook };
