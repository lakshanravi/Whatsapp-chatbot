const express = require("express");
const crypto = require("crypto");
const { v4: uuidv4 } = require("uuid");

const config = require("../config");
const Company = require("../models/Company");
const Conversation = require("../models/Conversation");
const ragClient = require("../services/ragClient");
const { preprocessUserMessage } = require("../services/messagePreprocessor");
const { verifyGoogleIdToken } = require("../services/googleAuth");
const { verifyExternalUserToken } = require("../services/externalUserAuth");
const { canAccessCompany } = require("../middleware/auth");
const { createRateLimit } = require("../middleware/rateLimit");

const router = express.Router({ mergeParams: true });
const widgetRateLimit = createRateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: "Too many chat requests. Please wait a moment.",
});

function isWidgetRequest(req) {
  return req.baseUrl?.startsWith("/widget/");
}

function isAllowedWidgetRoute(req) {
  if (!isWidgetRequest(req)) return true;

  if (req.method === "POST" && req.path === "/") return true;
  if (req.method === "POST" && req.path === "/feedback") return true;
  if (req.method === "POST" && req.path === "/auth/google") return true;
  if (req.method === "POST" && req.path === "/auth/external") return true;
  if (req.method === "GET" && req.path.startsWith("/history/")) return true;

  return false;
}

router.use((req, res, next) => {
  if (!isAllowedWidgetRoute(req)) {
    return res.status(404).json({ error: "Not found" });
  }
  next();
});

router.use((req, res, next) => (
  isWidgetRequest(req) ? widgetRateLimit(req, res, next) : next()
));

router.use(canAccessCompany);

function hashApiKey(key) {
  return crypto.createHash("sha256").update(String(key)).digest("hex");
}

function safeTimingCompare(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));

  if (left.length !== right.length) return false;

  return crypto.timingSafeEqual(left, right);
}

async function validateWidgetApiKey(req, company) {
  if (!isWidgetRequest(req)) return true;

  const apiKey = req.headers["x-widget-api-key"] || req.body.widgetApiKey;

  if (!apiKey) return false;

  const companyWithKey = await Company.findById(company._id).select("+widgetApiKeyHash");

  if (!companyWithKey?.widgetApiKeyHash) return false;

  return safeTimingCompare(companyWithKey.widgetApiKeyHash, hashApiKey(apiKey));
}

async function getCompanyOrFail(companyId, options = {}) {
  const query = Company.findById(companyId);

  if (options.includeExternalSecret) {
    query.select("+externalAuth.tokenSecret");
  }

  const company = await query;

  if (!company) {
    const error = new Error("Company not found");
    error.statusCode = 404;
    throw error;
  }

  if (!company.isActive) {
    const error = new Error("Company is inactive");
    error.statusCode = 403;
    throw error;
  }

  return company;
}

async function ensureWidgetAccess(req, company) {
  const widgetKeyOk = await validateWidgetApiKey(req, company);

  if (!widgetKeyOk) {
    const error = new Error("Invalid widget API key");
    error.statusCode = 401;
    throw error;
  }
}

function createGoogleSessionId(googleSub) {
  const hash = crypto
    .createHmac("sha256", config.jwtSecret)
    .update(`google:${googleSub}`)
    .digest("hex");

  return `web_google_${hash.slice(0, 48)}`;
}

function createExternalSessionId(companyId, externalUserId) {
  const hash = crypto
    .createHmac("sha256", config.jwtSecret)
    .update(`external:${companyId}:${externalUserId}`)
    .digest("hex");

  return `web_external_${hash.slice(0, 48)}`;
}

function createGuestSessionId() {
  return `web_guest_${uuidv4()}`;
}

function isValidGuestSessionId(sessionId) {
  if (!sessionId || typeof sessionId !== "string") return false;

  return sessionId.startsWith("web_guest_") || sessionId.startsWith("web_");
}

function mapSources(ragSources = []) {
  return ragSources.map((source) => ({
    documentId: source.document_id,
    documentName: source.document_name,
    content: source.content,
    score: source.score,
    pageNumber: source.page_number,
    sectionHeading: source.section_heading || "",
  }));
}

function nowMs() {
  return Number(process.hrtime.bigint() / 1000000n);
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function mergeGuestConversation({
  companyId,
  guestSessionId,
  targetSessionId,
  customerName,
  customerEmail,
  customerPhone,
  customerExternalId,
  customerAuthProvider,
}) {
  if (!isValidGuestSessionId(guestSessionId)) return;

  if (guestSessionId === targetSessionId) return;

  const guestConversation = await Conversation.findOne({
    companyId,
    sessionId: guestSessionId,
  });

  if (!guestConversation) return;

  let targetConversation = await Conversation.findOne({
    companyId,
    sessionId: targetSessionId,
  });

  if (!targetConversation) {
    guestConversation.sessionId = targetSessionId;
    guestConversation.customerName = customerName || guestConversation.customerName || "";
    guestConversation.customerEmail = customerEmail || guestConversation.customerEmail || "";
    guestConversation.customerPhone = customerPhone || guestConversation.customerPhone || "";
    guestConversation.customerExternalId =
      customerExternalId || guestConversation.customerExternalId || "";
    guestConversation.customerAuthProvider =
      customerAuthProvider || guestConversation.customerAuthProvider || "";
    guestConversation.channel = "web";

    await guestConversation.save();
    return;
  }

  targetConversation.customerName = customerName || targetConversation.customerName || "";
  targetConversation.customerEmail = customerEmail || targetConversation.customerEmail || "";
  targetConversation.customerPhone = customerPhone || targetConversation.customerPhone || "";
  targetConversation.customerExternalId =
    customerExternalId || targetConversation.customerExternalId || "";
  targetConversation.customerAuthProvider =
    customerAuthProvider || targetConversation.customerAuthProvider || "";

  if (guestConversation.messages?.length) {
    targetConversation.messages.push(...guestConversation.messages);
    // The guest messages are appended as the newest conversation turns, so
    // their active knowledge-base topic must move with them as well.
    if (
      guestConversation.ragContext?.productNames?.length
      || guestConversation.ragContext?.modelIds?.length
      || guestConversation.ragContext?.documentIds?.length
    ) {
      targetConversation.ragContext = {
        productNames: [...(guestConversation.ragContext.productNames || [])],
        modelIds: [...(guestConversation.ragContext.modelIds || [])],
        documentIds: [...(guestConversation.ragContext.documentIds || [])],
      };
    }
  }

  await targetConversation.save();

  await Conversation.deleteOne({
    _id: guestConversation._id,
  });
}

router.post("/auth/google", async (req, res) => {
  try {
    const company = await getCompanyOrFail(req.params.companyId);

    await ensureWidgetAccess(req, company);

    const { credential, guestSessionId } = req.body;

    const googleUser = await verifyGoogleIdToken(credential);

    const sessionId = createGoogleSessionId(googleUser.googleSub);

    await mergeGuestConversation({
      companyId: company._id,
      guestSessionId,
      targetSessionId: sessionId,
      customerName: googleUser.name,
      customerEmail: googleUser.email,
      customerExternalId: googleUser.googleSub,
      customerAuthProvider: "google",
    });

    res.json({
      authMode: "google",
      sessionId,
      customerName: googleUser.name,
      customerEmail: googleUser.email,
      picture: googleUser.picture,
    });
  } catch (err) {
    res.status(err.statusCode || 400).json({
      error: err.message || "Google authentication failed",
    });
  }
});

router.post("/auth/external", async (req, res) => {
  try {
    const company = await getCompanyOrFail(req.params.companyId, {
      includeExternalSecret: true,
    });

    await ensureWidgetAccess(req, company);

    const { token, guestSessionId } = req.body;

    const externalUser = verifyExternalUserToken(token, company);

    const sessionId = createExternalSessionId(
      company._id.toString(),
      externalUser.externalUserId
    );

    await mergeGuestConversation({
      companyId: company._id,
      guestSessionId,
      targetSessionId: sessionId,
      customerName: externalUser.name,
      customerEmail: externalUser.email,
      customerPhone: externalUser.phone,
      customerExternalId: externalUser.externalUserId,
      customerAuthProvider: "external",
    });

    res.json({
      authMode: "external",
      sessionId,
      customerName: externalUser.name,
      customerEmail: externalUser.email,
      customerPhone: externalUser.phone,
    });
  } catch (err) {
    res.status(err.statusCode || 400).json({
      error: err.message || "Company user authentication failed",
    });
  }
});

router.post("/", async (req, res) => {
  try {
    const requestStarted = nowMs();
    const timingsMs = {};
    const company = await getCompanyOrFail(req.params.companyId);

    await ensureWidgetAccess(req, company);

    const {
      message,
      sessionId,
      customerName,
      customerEmail,
      customerPhone,
      customerExternalId,
      customerAuthProvider,
      isSuggestion,
    } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ error: "Message is required" });
    }

    const sid = sessionId || createGuestSessionId();

    let conversation = await Conversation.findOne({
      companyId: company._id,
      sessionId: sid,
    });

    if (!conversation) {
      conversation = new Conversation({
        companyId: company._id,
        sessionId: sid,
        customerName: customerName || "",
        customerEmail: customerEmail || "",
        customerPhone: customerPhone || "",
        customerExternalId: customerExternalId || "",
        customerAuthProvider: customerAuthProvider || (sid.startsWith("web_guest_") ? "guest" : ""),
        channel: "web",
        messages: [],
      });
    } else {
      if (customerName) conversation.customerName = customerName;
      if (customerEmail) conversation.customerEmail = customerEmail;
      if (customerPhone) conversation.customerPhone = customerPhone;
      if (customerExternalId) conversation.customerExternalId = customerExternalId;
      if (customerAuthProvider) conversation.customerAuthProvider = customerAuthProvider;
    }

    const originalMessage = message.trim();
    conversation.messages.push({ role: "user", content: originalMessage });

    const preprocessStarted = nowMs();
    const preprocessed = await preprocessUserMessage(originalMessage, {
      skipSmallTalk: isSuggestion === true,
    });
    timingsMs.preprocessing = nowMs() - preprocessStarted;

    if (preprocessed.type === "small_talk") {
      conversation.messages.push({
        role: "assistant",
        content: preprocessed.reply,
      });
      await conversation.save();

      timingsMs.total = nowMs() - requestStarted;
      return res.json({
        sessionId: sid,
        answer: preprocessed.reply,
        sources: [],
        suggestions: [],
        conversationId: conversation._id,
        diagnostics: {
          timingsMs,
          cache: { hit: false },
        },
      });
    }

    const ragStarted = nowMs();
    const ragContext = ragClient.buildConversationRagContext(
      conversation.messages.slice(0, -1),
      conversation.ragContext
    );
    const ragResult = await ragClient.queryKnowledge({
      companyId: company._id.toString(),
      question: preprocessed.question,
      ...ragContext,
    });
    timingsMs.ragService = nowMs() - ragStarted;

    const sources = mapSources(ragResult.sources || []);
    const diagnostics = {
      ...(ragResult.diagnostics || {}),
      timingsMs: {
        ...(ragResult.diagnostics?.timings_ms || {}),
        ...(ragResult.diagnostics?.timingsMs || {}),
        backendPreprocessing: timingsMs.preprocessing,
        backendRagCall: timingsMs.ragService,
      },
      cache: ragResult.diagnostics?.cache || { hit: false },
    };
    diagnostics.timingsMs.backendTotal = nowMs() - requestStarted;

    ragClient.updateConversationRagContext(conversation, ragResult);

    conversation.messages.push({
      role: "assistant",
      content: ragResult.answer,
      sources,
      diagnostics,
    });

    await conversation.save();

    res.json({
      sessionId: sid,
      answer: ragResult.answer,
      sources,
      suggestions: ragResult.suggestions || [],
      conversationId: conversation._id,
      diagnostics,
    });
  } catch (err) {
    const detail = err.response?.data?.detail || err.message;

    res.status(err.statusCode || err.response?.status || 500).json({
      error: detail,
    });
  }
});

router.post("/feedback", async (req, res) => {
  try {
    const company = await getCompanyOrFail(req.params.companyId);
    await ensureWidgetAccess(req, company);
    const { conversationId, feedback } = req.body;
    if (!["helpful", "not_helpful"].includes(feedback)) {
      return res.status(400).json({ error: "Invalid feedback value" });
    }
    const conversation = await Conversation.findOne({
      _id: conversationId,
      companyId: company._id,
    });
    if (!conversation) {
      return res.status(404).json({ error: "Conversation not found" });
    }
    const assistantMessage = [...conversation.messages]
      .reverse()
      .find((message) => message.role === "assistant");
    if (!assistantMessage) {
      return res.status(404).json({ error: "Assistant message not found" });
    }
    assistantMessage.feedback = feedback;
    await conversation.save();
    res.json({ success: true, feedback });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.get("/history/:sessionId", async (req, res) => {
  try {
    const company = await getCompanyOrFail(req.params.companyId);

    if (isWidgetRequest(req)) {
      await ensureWidgetAccess(req, company);
    }

    const conversation = await Conversation.findOne({
      companyId: company._id,
      sessionId: req.params.sessionId,
    });

    if (!conversation) {
      if (isWidgetRequest(req)) {
        return res.json({
          sessionId: req.params.sessionId,
          messages: [],
        });
      }

      return res.status(404).json({
        error: "Conversation not found",
      });
    }

    res.json(conversation);
  } catch (err) {
    res.status(err.statusCode || 500).json({
      error: err.message,
    });
  }
});

router.get("/conversations", async (req, res) => {
  try {
    const filter = {
      companyId: req.params.companyId,
    };

    const search = String(req.query.search || "").trim();
    if (search) {
      const regex = new RegExp(escapeRegex(search), "i");
      filter.$or = [
        { sessionId: regex },
        { customerName: regex },
        { customerEmail: regex },
        { customerPhone: regex },
        { customerExternalId: regex },
        { customerAuthProvider: regex },
        { channel: regex },
      ];
    }

    const conversations = await Conversation.find(filter)
      .sort({ updatedAt: -1 })
      .select("-messages");

    res.json(conversations);
  } catch (err) {
    res.status(500).json({
      error: err.message,
    });
  }
});

module.exports = router;
