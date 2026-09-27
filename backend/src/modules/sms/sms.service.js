const twilio = require("twilio");

const config = require("../../config");
const Company = require("../../models/Company");
const Conversation = require("../../models/Conversation");
const SmsIntegration = require("../../models/SmsIntegration");
const SmsMessageLog = require("../../models/SmsMessageLog");
const WebhookEvent = require("../../models/WebhookEvent");
const ragClient = require("../../services/ragClient");
const { preprocessUserMessage } = require("../../services/messagePreprocessor");

const MAX_SMS_REPLY_LENGTH = 320;

function normalizePhoneNumber(value) {
  return String(value || "").trim();
}

function mapSources(sources) {
  return (sources || []).map((source) => ({
    documentId: source.document_id,
    documentName: source.document_name,
    content: source.content,
    score: source.score,
    pageNumber: source.page_number,
    sectionHeading: source.section_heading || "",
  }));
}

function formatSmsReply(text) {
  const value = String(text || "").trim();
  if (value.length <= MAX_SMS_REPLY_LENGTH) return value;
  return `${value.slice(0, MAX_SMS_REPLY_LENGTH - 3).trim()}...`;
}

function getRequestUrl(req) {
  const protocol = req.headers["x-forwarded-proto"] || req.protocol;
  const host = req.headers["x-forwarded-host"] || req.get("host");
  return `${protocol}://${host}${req.originalUrl}`;
}

async function getCompany(companyId) {
  const company = await Company.findById(companyId);
  if (!company) throw new Error("SMS company not found");
  if (!company.isActive) throw new Error("SMS company is inactive");
  return company;
}

async function getIntegrationByPhoneNumber(phoneNumber) {
  const normalized = normalizePhoneNumber(phoneNumber);
  if (!normalized) throw new Error("SMS receiver phone number missing from webhook payload");
  const integration = await SmsIntegration.findOne({ phoneNumber: normalized, isActive: true }).select("+encryptedAuthToken +authTokenIv +authTokenAuthTag");
  if (!integration) throw new Error("SMS integration not found for Twilio phone number");
  return integration;
}

async function getIntegrationByCompanyId(companyId) {
  if (!companyId || !String(companyId).trim()) throw new Error("Company ID is required for SMS send");
  const integration = await SmsIntegration.findOne({ companyId, isActive: true }).select("+encryptedAuthToken +authTokenIv +authTokenAuthTag");
  if (!integration) throw new Error("Active SMS integration not found for company");
  await getCompany(integration.companyId);
  return integration;
}

function validateTwilioWebhook(req, integration) {
  if (!config.twilioValidateWebhookSignature) return;
  const signature = req.headers["x-twilio-signature"];
  if (!signature) {
    const err = new Error("Missing Twilio webhook signature");
    err.status = 403;
    throw err;
  }
  const valid = twilio.validateRequest(integration.getAuthToken(), signature, getRequestUrl(req), req.body);
  if (!valid) {
    const err = new Error("Invalid Twilio webhook signature");
    err.status = 403;
    throw err;
  }
}

async function createRagReply(incomingMessage) {
  const integration = await getIntegrationByPhoneNumber(incomingMessage.receiverPhoneNumber);
  const company = await getCompany(integration.companyId);

  if (!incomingMessage.isSupported) {
    return { answer: incomingMessage.fallbackText, sources: [], conversationId: null, sessionId: null, integration, company };
  }

  const question = incomingMessage.textBody.trim();
  if (!question) {
    return { answer: "Please send a text message so I can help you.", sources: [], conversationId: null, sessionId: null, integration, company };
  }

  const sessionId = `sms:${incomingMessage.senderPhoneNumber}`;
  let conversation = await Conversation.findOne({ companyId: company._id, sessionId });

  if (!conversation) {
    conversation = new Conversation({ companyId: company._id, sessionId, customerPhone: incomingMessage.senderPhoneNumber || "", channel: "sms", messages: [] });
  } else if (incomingMessage.senderPhoneNumber) {
    conversation.customerPhone = incomingMessage.senderPhoneNumber;
  }

  conversation.messages.push({ role: "user", content: question });

  const preprocessed = await preprocessUserMessage(question);
  let answer;
  let sources = [];

  if (preprocessed.type === "small_talk") {
    answer = formatSmsReply(preprocessed.reply);
  } else {
    const ragContext = ragClient.buildConversationRagContext(
      conversation.messages.slice(0, -1),
      conversation.ragContext
    );
    const ragResult = await ragClient.queryKnowledge({
      companyId: company._id.toString(),
      question: preprocessed.question,
      ...ragContext,
    });
    sources = mapSources(ragResult.sources);
    answer = formatSmsReply(ragResult.answer || "I could not find an answer for that yet.");
    ragClient.updateConversationRagContext(conversation, ragResult);
  }

  conversation.messages.push({ role: "assistant", content: answer, sources });
  await conversation.save();

  await SmsMessageLog.create({
    companyId: company._id,
    conversationId: conversation._id,
    smsIntegrationId: integration._id,
    direction: "incoming",
    from: incomingMessage.senderPhoneNumber,
    to: incomingMessage.receiverPhoneNumber,
    body: question,
    twilioMessageSid: incomingMessage.smsMessageId,
    status: "received",
    rawPayload: incomingMessage.rawPayload,
  });

  return { answer, sources, conversationId: conversation._id, sessionId, integration, company };
}

async function sendTextMessage({ to, text, companyId, integration, conversationId }) {
  const recipient = normalizePhoneNumber(to);
  if (!recipient) throw new Error("Recipient phone number is required");
  const body = formatSmsReply(text);
  if (!body) throw new Error("Message text is required");

  const activeIntegration = integration || (await getIntegrationByCompanyId(companyId));
  const client = twilio(activeIntegration.accountSid, activeIntegration.getAuthToken());
  const payload = { body, from: activeIntegration.phoneNumber, to: recipient };
  if (config.publicBackendUrl) payload.statusCallback = `${config.publicBackendUrl.replace(/\/$/, "")}/api/sms/status`;

  try {
    const message = await client.messages.create(payload);
    await SmsMessageLog.create({
      companyId: activeIntegration.companyId,
      conversationId: conversationId || null,
      smsIntegrationId: activeIntegration._id,
      direction: "outgoing",
      from: activeIntegration.phoneNumber,
      to: recipient,
      body,
      twilioMessageSid: message.sid,
      status: message.status || "queued",
      rawPayload: { sid: message.sid, status: message.status, errorCode: message.errorCode, errorMessage: message.errorMessage },
    });
    return message;
  } catch (err) {
    err.smsContext = { companyId: activeIntegration.companyId, accountSid: activeIntegration.accountSid, phoneNumber: activeIntegration.phoneNumber, authTokenLast4: activeIntegration.authTokenLast4 };
    throw err;
  }
}

async function replyToIncomingMessage(incomingMessage, req) {
  const integration = await getIntegrationByPhoneNumber(incomingMessage.receiverPhoneNumber);
  if (req) validateTwilioWebhook(req, integration);
  if (incomingMessage.smsMessageId) {
    try {
      await WebhookEvent.create({ provider: "sms", eventId: incomingMessage.smsMessageId });
    } catch (error) {
      if (error.code === 11000) return { provider: "twilio", duplicate: true };
      throw error;
    }
  }
  const reply = await createRagReply(incomingMessage);
  const result = await sendTextMessage({ to: incomingMessage.senderPhoneNumber, text: reply.answer, integration: reply.integration, conversationId: reply.conversationId });
  return { provider: "twilio", messageSid: result.sid, status: result.status, answer: reply.answer, conversationId: reply.conversationId, sessionId: reply.sessionId };
}

async function validateIntegration({ companyId }) {
  const integration = await getIntegrationByCompanyId(companyId);
  const client = twilio(integration.accountSid, integration.getAuthToken());
  try {
    await client.api.accounts(integration.accountSid).fetch();
    const numbers = await client.incomingPhoneNumbers.list({ phoneNumber: integration.phoneNumber, limit: 1 });
    if (!numbers.length) {
      const err = new Error("Twilio phone number was not found in this account");
      err.status = 404;
      throw err;
    }
    integration.phoneNumberSid = numbers[0].sid || integration.phoneNumberSid;
    await integration.save();
    return { status: "valid", companyId: integration.companyId, accountSid: integration.accountSid, phoneNumber: integration.phoneNumber, twilioPhoneNumberSid: numbers[0].sid, friendlyName: numbers[0].friendlyName, capabilities: numbers[0].capabilities };
  } catch (err) {
    err.smsContext = { companyId: integration.companyId, accountSid: integration.accountSid, phoneNumber: integration.phoneNumber, authTokenLast4: integration.authTokenLast4 };
    throw err;
  }
}

async function updateMessageStatus(payload, req) {
  const twilioMessageSid = payload.MessageSid || payload.SmsSid || payload.MessageSID;
  if (!twilioMessageSid) return { status: "ignored", reason: "missing MessageSid" };
  const existing = await SmsMessageLog.findOne({ twilioMessageSid });
  if (!existing) return { status: "not_found", twilioMessageSid };
  const integration = await SmsIntegration.findById(existing.smsIntegrationId)
    .select("+encryptedAuthToken +authTokenIv +authTokenAuthTag");
  if (!integration) throw new Error("SMS integration not found for status callback");
  if (req) validateTwilioWebhook(req, integration);
  const update = { status: payload.MessageStatus || payload.SmsStatus || payload.status || "unknown", errorCode: payload.ErrorCode || "", errorMessage: payload.ErrorMessage || "", rawPayload: payload };
  const log = await SmsMessageLog.findOneAndUpdate({ twilioMessageSid }, { $set: update }, { new: true });
  return { status: log ? "updated" : "not_found", twilioMessageSid, messageStatus: update.status };
}

module.exports = { replyToIncomingMessage, sendTextMessage, validateIntegration, updateMessageStatus };
