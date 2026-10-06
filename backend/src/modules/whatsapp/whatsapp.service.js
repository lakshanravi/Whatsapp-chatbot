const axios = require("axios");

const config = require("../../config");
const Company = require("../../models/Company");
const WhatsAppIntegration = require("../../models/WhatsAppIntegration");
const { processCustomerMessage } = require("../../services/customerMessaging");

function assertGraphConfig() {
  if (!config.graphApiVersion) {
    throw new Error("Missing WhatsApp configuration: GRAPH_API_VERSION");
  }
}

function buildMessagesUrl(phoneNumberId) {
  assertGraphConfig();

  const version = config.graphApiVersion.startsWith("v")
    ? config.graphApiVersion
    : `v${config.graphApiVersion}`;

  return `https://graph.facebook.com/${version}/${phoneNumberId}/messages`;
}

function buildPhoneNumberUrl(phoneNumberId) {
  assertGraphConfig();

  const version = config.graphApiVersion.startsWith("v")
    ? config.graphApiVersion
    : `v${config.graphApiVersion}`;

  return `https://graph.facebook.com/${version}/${phoneNumberId}`;
}

function createEchoReply(incomingMessage) {
  if (!incomingMessage.isSupported) {
    return incomingMessage.fallbackText;
  }

  return `You said: ${incomingMessage.textBody || "[empty message]"}`;
}

async function getCompany(companyId) {
  const company = await Company.findById(companyId);
  if (!company) {
    throw new Error("WhatsApp company not found");
  }

  if (!company.isActive) {
    throw new Error("WhatsApp company is inactive");
  }

  return company;
}

async function getIntegrationByPhoneNumberId(phoneNumberId) {
  if (!phoneNumberId || !String(phoneNumberId).trim()) {
    throw new Error("WhatsApp phone number ID missing from webhook payload");
  }

  const integration = await WhatsAppIntegration.findOne({
    phoneNumberId: String(phoneNumberId).trim(),
    isActive: true,
  }).select("+encryptedAccessToken +accessTokenIv +accessTokenAuthTag");

  if (!integration) {
    throw new Error("WhatsApp integration not found for phone number ID");
  }

  return integration;
}

async function getIntegrationByCompanyId(companyId) {
  if (!companyId || !String(companyId).trim()) {
    throw new Error("Company ID is required for WhatsApp send");
  }

  const integration = await WhatsAppIntegration.findOne({
    companyId,
    isActive: true,
  }).select("+encryptedAccessToken +accessTokenIv +accessTokenAuthTag");

  if (!integration) {
    throw new Error("Active WhatsApp integration not found for company");
  }

  await getCompany(integration.companyId);

  return integration;
}

async function createRagReply(incomingMessage) {
  if (!incomingMessage.isSupported) {
    return {
      answer: incomingMessage.fallbackText,
      sources: [],
      conversationId: null,
      sessionId: null,
    };
  }

  const question = incomingMessage.textBody.trim();
  if (!question) {
    return {
      answer: "Please send a text message so I can help you.",
      sources: [],
      conversationId: null,
      sessionId: null,
    };
  }

  const integration = await getIntegrationByPhoneNumberId(incomingMessage.phoneNumberId);
  const company = await getCompany(integration.companyId);
  const sessionId = `whatsapp:${incomingMessage.waId || incomingMessage.senderPhoneNumber}`;
  const result = await processCustomerMessage({
    companyId: company._id,
    sessionId,
    channel: "whatsapp",
    text: question,
    customer: {
      name: incomingMessage.customerProfileName || "",
      phone: incomingMessage.senderPhoneNumber || "",
      externalId: incomingMessage.waId || incomingMessage.senderPhoneNumber || "",
    },
  });

  return {
    answer: result.answer,
    sources: result.sources || [],
    media: result.media || [],
    suggestions: result.suggestions || [],
    conversationId: result.conversation?._id,
    orderId: result.order?._id,
    sessionId,
    integration,
  };
}

async function sendTextMessage({ to, text, companyId, integration }) {
  if (!to || !String(to).trim()) {
    throw new Error("Recipient phone number is required");
  }

  if (!text || !String(text).trim()) {
    throw new Error("Message text is required");
  }

  const activeIntegration = integration || (await getIntegrationByCompanyId(companyId));
  const accessToken = activeIntegration.getAccessToken();

  try {
    const response = await axios.post(
      buildMessagesUrl(activeIntegration.phoneNumberId),
      {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: String(to).trim(),
        type: "text",
        text: {
          preview_url: false,
          body: String(text).trim(),
        },
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    return response.data;
  } catch (err) {
    err.whatsappContext = {
      companyId: activeIntegration.companyId?.toString(),
      phoneNumberId: activeIntegration.phoneNumberId,
      accessTokenLast4: activeIntegration.accessTokenLast4,
    };
    throw err;
  }
}

async function sendImageMessage({ to, imageUrl, caption = "", integration }) {
  const accessToken = integration.getAccessToken();
  const response = await axios.post(
    buildMessagesUrl(integration.phoneNumberId),
    {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: String(to).trim(),
      type: "image",
      image: { link: imageUrl, caption: String(caption || "").slice(0, 1024) },
    },
    { headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" } }
  );
  return response.data;
}

async function sendChoiceMessage({ to, text, suggestions, integration }) {
  const accessToken = integration.getAccessToken();
  const buttons = suggestions.slice(0, 3).map((suggestion, index) => ({
    type: "reply",
    reply: { id: `choice_${index + 1}`, title: String(suggestion.label).slice(0, 20) },
  }));
  const response = await axios.post(
    buildMessagesUrl(integration.phoneNumberId),
    {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: String(to).trim(),
      type: "interactive",
      interactive: { type: "button", body: { text: String(text).slice(0, 1024) }, action: { buttons } },
    },
    { headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" } }
  );
  return response.data;
}

async function validateIntegration({ companyId }) {
  const integration = await getIntegrationByCompanyId(companyId);
  const accessToken = integration.getAccessToken();

  let response;
  try {
    response = await axios.get(buildPhoneNumberUrl(integration.phoneNumberId), {
      params: {
        fields: "id,display_phone_number,verified_name,quality_rating",
      },
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  } catch (err) {
    err.whatsappContext = {
      companyId: integration.companyId?.toString(),
      phoneNumberId: integration.phoneNumberId,
      accessTokenLast4: integration.accessTokenLast4,
    };
    throw err;
  }

  return {
    status: "valid",
    companyId: integration.companyId,
    phoneNumberId: integration.phoneNumberId,
    accessTokenLast4: integration.accessTokenLast4,
    metaPhoneNumber: response.data,
  };
}

async function replyToIncomingMessage(incomingMessage) {
  const reply = await createRagReply(incomingMessage);
  const integration =
    reply.integration || (await getIntegrationByPhoneNumberId(incomingMessage.phoneNumberId));

  const metaResult = reply.suggestions?.length
    ? await sendChoiceMessage({
      to: incomingMessage.senderPhoneNumber,
      text: reply.answer,
      suggestions: reply.suggestions,
      integration,
    })
    : await sendTextMessage({
      to: incomingMessage.senderPhoneNumber,
      text: reply.answer,
      integration,
    });
  const mediaResults = [];
  for (const media of (reply.media || []).slice(0, 3)) {
    mediaResults.push(await sendImageMessage({
      to: incomingMessage.senderPhoneNumber,
      imageUrl: media.url,
      caption: media.altText,
      integration,
    }));
  }

  return {
    answer: reply.answer,
    sources: reply.sources,
    media: reply.media || [],
    conversationId: reply.conversationId,
    sessionId: reply.sessionId,
    metaResult,
    mediaResults,
  };
}

module.exports = {
  createEchoReply,
  createRagReply,
  replyToIncomingMessage,
  sendTextMessage,
  sendImageMessage,
  sendChoiceMessage,
  validateIntegration,
};
