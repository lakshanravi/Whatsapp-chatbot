const test = require("node:test");
const assert = require("node:assert/strict");

const {
  detectExplicitLanguage,
  detectLanguage,
  isBack,
  isCancel,
  isLanguageRequest,
  isNegative,
  isPlausibleAddress,
  isPlausibleName,
  isPlausiblePhone,
  isValidQuantity,
  localizedText,
  resolveCatalogProduct,
} = require("../src/services/commerce");
const { mapIncomingWebhook } = require("../src/modules/messenger/messenger.mapper");
const Conversation = require("../src/models/Conversation");
const Order = require("../src/models/Order");

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

test("global order commands accept natural phrases", () => {
  assert.equal(isCancel("cancel order"), true);
  assert.equal(isCancel("Please cancel my order"), true);
  assert.equal(isBack("go back"), true);
  assert.equal(isLanguageRequest("can I change the language?"), true);
  assert.equal(isNegative("no"), true);
});

test("order quantities require a complete integer from 1 to 100", () => {
  assert.equal(isValidQuantity("5"), true);
  assert.equal(isValidQuantity("5 items"), false);
  assert.equal(isValidQuantity("0"), false);
  assert.equal(isValidQuantity("101"), false);
});

test("order contact details reject commands and obvious placeholders", () => {
  assert.equal(isPlausibleName("Lakshan"), true);
  assert.equal(isPlausibleName("cancel order"), false);
  assert.equal(isPlausiblePhone("+94 77 123 4567"), true);
  assert.equal(isPlausiblePhone("123456789"), false);
  assert.equal(isPlausibleAddress("Pallewela, Sri Lanka"), true);
  assert.equal(isPlausibleAddress("back"), false);
});

test("PDF catalog resolution rejects arbitrary sentences", () => {
  const catalog = {
    products: [
      { key: "aerobreeze", name: "AeroBreeze Table Fan", model_ids: ["LHSFAN16"] },
      { key: "quickboil", name: "QuickBoil Glass Kettle", model_ids: ["LHSKTL17"] },
    ],
    modelIds: ["LHSFAN16", "LHSKTL17"],
  };
  assert.deepEqual(resolveCatalogProduct(catalog, "AeroBreeze Table Fan"), {
    name: "AeroBreeze Table Fan",
    sku: "",
  });
  assert.equal(resolveCatalogProduct(catalog, "can i change the language"), null);
  assert.deepEqual(resolveCatalogProduct(catalog, "2"), {
    name: "QuickBoil Glass Kettle",
    sku: "",
  });
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

test("conversation messages preserve extracted PDF media", async () => {
  const conversation = new Conversation({
    companyId: "507f1f77bcf86cd799439011",
    sessionId: "web-media-test",
    channel: "web",
    messages: [{
      role: "assistant",
      content: "The requested image is shown below.",
      media: [{
        url: "http://localhost:3000/media/company/document/image.png",
        altText: "Product image",
        documentId: "document",
        documentName: "Visual Guide.pdf",
        pageNumber: 1,
        mimeType: "image/png",
      }],
    }],
  });
  await conversation.validate();
  assert.equal(conversation.messages[0].media.length, 1);
  assert.equal(conversation.messages[0].media[0].documentName, "Visual Guide.pdf");
});

test("PDF-only orders do not require a catalogue product or known price", async () => {
  const order = new Order({
    companyId: "507f1f77bcf86cd799439011",
    orderNumber: "ORD-TEST-1",
    sessionId: "web-test",
    channel: "web",
    customer: { name: "Test User", deliveryAddress: "Colombo" },
    items: [{ name: "Product described in a PDF", quantity: 2 }],
    subtotal: 0,
    total: 0,
    paymentMethod: "Cash on delivery",
  });
  await order.validate();
  assert.equal(order.items[0].productId, null);
  assert.equal(order.priceStatus, "pending");
});
