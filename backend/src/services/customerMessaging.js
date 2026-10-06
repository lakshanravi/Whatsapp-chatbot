const { processCommerceMessage } = require("./commerce");
const { preprocessUserMessage } = require("./messagePreprocessor");
const ragClient = require("./ragClient");
const { findQuestionMedia, mapSourcesWithMedia } = require("./sourceMedia");

async function processCustomerMessage({ companyId, sessionId, channel, text, customer }) {
  const commerce = await processCommerceMessage({
    companyId,
    sessionId,
    channel,
    text,
    customer,
  });
  if (commerce.handled) {
    const media = await findQuestionMedia(companyId, text);
    if (media.length && commerce.conversation?.messages?.length) {
      commerce.conversation.messages[commerce.conversation.messages.length - 1].media = media;
      await commerce.conversation.save();
    }
    return { ...commerce, media };
  }

  const { conversation, language } = commerce;
  const preprocessed = await preprocessUserMessage(text);
  if (preprocessed.type === "small_talk") {
    conversation.messages.push({ role: "assistant", content: preprocessed.reply });
    await conversation.save();
    return {
      answer: preprocessed.reply,
      sources: [],
      conversation,
      language,
    };
  }

  const ragContext = ragClient.buildConversationRagContext(
    conversation.messages.slice(0, -1),
    conversation.ragContext
  );
  const ragResult = await ragClient.queryKnowledge({
    companyId: String(companyId),
    question: preprocessed.question,
    responseLanguage: language,
    ...ragContext,
  });
  const mapped = await mapSourcesWithMedia(companyId, ragResult.sources || []);
  const fallbackMedia = await findQuestionMedia(companyId, text);
  const { sources } = mapped;
  const media = mapped.media.length ? mapped.media : fallbackMedia;
  const answer = ragResult.answer || "I could not find an answer for that yet.";
  ragClient.updateConversationRagContext(conversation, ragResult);
  conversation.messages.push({ role: "assistant", content: answer, sources, media });
  await conversation.save();
  return { answer, sources, media, conversation, language, suggestions: ragResult.suggestions || [] };
}

module.exports = { processCustomerMessage };
