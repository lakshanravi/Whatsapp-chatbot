const axios = require("axios");
const config = require("../../config");
const MessengerIntegration = require("../../models/MessengerIntegration");
const { processCustomerMessage } = require("../../services/customerMessaging");

async function integrationForPage(pageId) {
  const integration = await MessengerIntegration.findOne({ pageId, isActive: true })
    .select("+encryptedPageAccessToken +pageAccessTokenIv +pageAccessTokenAuthTag");
  if (!integration) throw new Error("Messenger integration not found for Facebook Page");
  return integration;
}

async function sendText({ recipientId, text, integration }) {
  const version = String(config.graphApiVersion || "v20.0").replace(/^v?/, "v");
  const response = await axios.post(
    `https://graph.facebook.com/${version}/me/messages`,
    {
      recipient: { id: recipientId },
      messaging_type: "RESPONSE",
      message: { text: String(text).slice(0, 2000) },
    },
    { params: { access_token: integration.getPageAccessToken() } }
  );
  return response.data;
}

async function replyToMessage(message) {
  const integration = await integrationForPage(message.pageId);
  const result = await processCustomerMessage({
    companyId: integration.companyId,
    sessionId: `messenger:${message.senderId}`,
    channel: "messenger",
    text: message.text,
    customer: { externalId: message.senderId },
  });
  const providerResult = await sendText({
    recipientId: message.senderId,
    text: result.answer,
    integration,
  });
  return {
    answer: result.answer,
    conversationId: result.conversation?._id,
    orderId: result.order?._id,
    providerResult,
  };
}

async function validateIntegration(companyId) {
  const integration = await MessengerIntegration.findOne({ companyId, isActive: true })
    .select("+encryptedPageAccessToken +pageAccessTokenIv +pageAccessTokenAuthTag");
  if (!integration) throw new Error("Active Messenger integration not found");
  const version = String(config.graphApiVersion || "v20.0").replace(/^v?/, "v");
  const response = await axios.get(`https://graph.facebook.com/${version}/${integration.pageId}`, {
    params: { fields: "id,name", access_token: integration.getPageAccessToken() },
  });
  integration.pageName = response.data.name || integration.pageName;
  await integration.save();
  return { status: "valid", page: response.data };
}

module.exports = { replyToMessage, sendText, validateIntegration };
