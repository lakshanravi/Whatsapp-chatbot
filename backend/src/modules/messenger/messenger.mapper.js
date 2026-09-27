function mapIncomingWebhook(payload) {
  const messages = [];
  for (const entry of Array.isArray(payload?.entry) ? payload.entry : []) {
    for (const event of Array.isArray(entry?.messaging) ? entry.messaging : []) {
      if (event.message?.is_echo) continue;
      const text = event.message?.text || event.postback?.title || event.postback?.payload || "";
      if (!text) continue;
      messages.push({
        pageId: String(entry.id || event.recipient?.id || ""),
        senderId: String(event.sender?.id || ""),
        messageId: String(event.message?.mid || event.postback?.mid || ""),
        text: String(text).trim(),
        timestamp: event.timestamp || null,
      });
    }
  }
  return messages;
}

module.exports = { mapIncomingWebhook };
