const { processCommerceMessage } = require("./commerce");
const { preprocessUserMessage } = require("./messagePreprocessor");
const ragClient = require("./ragClient");

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

async function processCustomerMessage({ companyId, sessionId, channel, text, customer }) {
  const commerce = await processCommerceMessage({
    companyId,
    sessionId,
    channel,
    text,
    customer,
  });
  if (commerce.handled) return commerce;

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
  const sources = mapSources(ragResult.sources);
  const answer = ragResult.answer || "I could not find an answer for that yet.";
  ragClient.updateConversationRagContext(conversation, ragResult);
  conversation.messages.push({ role: "assistant", content: answer, sources });
  await conversation.save();
  return { answer, sources, conversation, language, suggestions: ragResult.suggestions || [] };
}

module.exports = { processCustomerMessage };
