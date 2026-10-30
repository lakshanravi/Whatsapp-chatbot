function getMessageText(message) {
  if (!message) {
    return "";
  }

  if (message.type === "text") {
    return message.text?.body || "";
  }

  if (message.type === "button") {
    return message.button?.text || message.button?.payload || "";
  }

  if (message.type === "interactive") {
    if (message.interactive?.type === "button_reply") {
      return message.interactive.button_reply?.id || message.interactive.button_reply?.title || "";
    }

    if (message.interactive?.type === "list_reply") {
      return message.interactive.list_reply?.id || message.interactive.list_reply?.title || "";
    }
  }

  return "";
}

function getMessageType(message) {
  if (message?.type !== "interactive") {
    return message?.type || "unknown";
  }

  return message.interactive?.type
    ? `interactive.${message.interactive.type}`
    : "interactive";
}

function getUnsupportedFallback(message) {
  const type = getMessageType(message);
  return `Unsupported WhatsApp message type: ${type}. Please send a text, button, or list reply message.`;
}

function isSupportedMessage(message) {
  if (!message) {
    return false;
  }

  if (message.type === "text" || message.type === "button") {
    return true;
  }

  return (
    message.type === "interactive" &&
    ["button_reply", "list_reply"].includes(message.interactive?.type)
  );
}

function mapIncomingWebhook(payload) {
  const mappedMessages = [];
  const entries = Array.isArray(payload?.entry) ? payload.entry : [];

  entries.forEach((entry) => {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];

    changes.forEach((change) => {
      const value = change?.value || {};
      const metadata = value.metadata || {};
      const contacts = Array.isArray(value.contacts) ? value.contacts : [];
      const messages = Array.isArray(value.messages) ? value.messages : [];

      messages.forEach((message) => {
        const contact = contacts.find((item) => item.wa_id === message.from) || {};
        const supported = isSupportedMessage(message);
        const textBody = getMessageText(message).trim();

        mappedMessages.push({
          senderPhoneNumber: message.from || "",
          whatsappMessageId: message.id || "",
          messageType: getMessageType(message),
          textBody,
          customerProfileName: contact.profile?.name || "",
          waId: contact.wa_id || message.from || "",
          phoneNumberId: metadata.phone_number_id || "",
          isSupported: supported,
          fallbackText: supported ? "" : getUnsupportedFallback(message),
          rawTimestamp: message.timestamp || "",
        });
      });
    });
  });

  return mappedMessages;
}

module.exports = {
  mapIncomingWebhook,
};
