const test = require("node:test");
const assert = require("node:assert/strict");

const { detectExplicitLanguage, detectLanguage, localizedText } = require("../src/services/commerce");
const { mapIncomingWebhook } = require("../src/modules/messenger/messenger.mapper");
const Conversation = require("../src/models/Conversation");
const Product = require("../src/models/Product");

test("detects all supported language selections", () => {
  assert.equal(detectLanguage("1"), "si");
  assert.equal(detectLanguage("English"), "en");
  assert.equal(detectLanguage("தமிழ்"), "ta");
  assert.equal(detectLanguage("hello"), "");
});

test("does not interpret order quantities as language changes", () => {
  assert.equal(detectExplicitLanguage("3"), "");
  assert.equal(detectExplicitLanguage("Tamil"), "ta");
});

test("localized product names fall back to an available translation", () => {
  assert.equal(localizedText({ en: "Tea", si: "තේ" }, "si"), "තේ");
  assert.equal(localizedText({ en: "Tea", si: "" }, "ta"), "Tea");
});

test("maps Messenger text and postback events and ignores echoes", () => {
  const result = mapIncomingWebhook({
    entry: [{
      id: "page-1",
      messaging: [
        { sender: { id: "customer-1" }, message: { mid: "m1", text: "English" } },
        { sender: { id: "customer-1" }, postback: { mid: "m2", payload: "order", title: "Order" } },
        { sender: { id: "page-1" }, message: { mid: "m3", text: "echo", is_echo: true } },
      ],
    }],
  });
  assert.equal(result.length, 2);
  assert.deepEqual(result.map((item) => item.text), ["English", "Order"]);
  assert.equal(result[0].pageId, "page-1");
  assert.equal(result[0].senderId, "customer-1");
});

test("conversation schema supports Messenger language and order state", async () => {
  const conversation = new Conversation({
    companyId: "507f1f77bcf86cd799439011",
    sessionId: "messenger:customer-1",
    channel: "messenger",
    preferredLanguage: "ta",
    commerceState: { stage: "awaiting_quantity", draft: { quantity: 2 } },
  });
  await conversation.validate();
  assert.equal(conversation.channel, "messenger");
  assert.equal(conversation.preferredLanguage, "ta");
});

test("product schema rejects negative prices", async () => {
  const product = new Product({
    companyId: "507f1f77bcf86cd799439011",
    sku: "SKU-1",
    name: { en: "Tea" },
    price: -1,
  });
  await assert.rejects(product.validate(), /less than minimum allowed value/);
});
