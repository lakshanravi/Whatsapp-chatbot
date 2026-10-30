const test = require("node:test");
const assert = require("node:assert/strict");

const {
  detectExplicitLanguage,
  detectLanguage,
  isBack,
  isCancel,
  isLanguageRequest,
  isCatalogListIntent,
  isCommercialProductIntent,
  isAddAnother,
  isCheckout,
  isRemoveItem,
  isViewCart,
  isNegative,
  isPlausibleAddress,
  isPlausibleName,
  isPlausiblePhone,
  isValidQuantity,
  localizedText,
  addCurrentItemToCart,
  cartTotals,
  cartSummary,
  resolveCatalogProduct,
} = require("../src/services/commerce");
const { mapIncomingWebhook } = require("../src/modules/messenger/messenger.mapper");
const { mapIncomingWebhook: mapWhatsAppWebhook } = require("../src/modules/whatsapp/whatsapp.mapper");
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

test("dashboard catalog resolution supports names, SKUs, and list choices", () => {
  const catalog = {
    products: [
      { productId: "p1", name: "AeroBreeze Table Fan", alternateNames: ["AeroBreeze මේස විදුලි පංකාව"], sku: "LHS-FAN-16", price: 8900 },
      { productId: "p2", name: "QuickBoil Glass Kettle", alternateNames: ["QuickBoil වීදුරු කේතලය"], sku: "LHS-KTL-17", price: 6500 },
    ],
  };
  assert.equal(resolveCatalogProduct(catalog, "AeroBreeze Table Fan").productId, "p1");
  assert.equal(resolveCatalogProduct(catalog, "Do you have LHS-KTL-17?").productId, "p2");
  assert.equal(resolveCatalogProduct(catalog, "can i change the language"), null);
  assert.equal(resolveCatalogProduct(catalog, "2").productId, "p2");
});

test("recognizes catalogue discovery and commercial product questions", () => {
  assert.equal(isCatalogListIntent("what products do you have"), true);
  assert.equal(isCatalogListIntent("show me your catalogue"), true);
  assert.equal(isCatalogListIntent("monawada thiyena products"), true);
  assert.equal(isCatalogListIntent("tell me the warranty"), false);
  assert.equal(isCommercialProductIntent("How much is the QuickBoil kettle?"), true);
  assert.equal(isCommercialProductIntent("Tell me its technical specifications"), false);
});

test("recognizes clickable cart actions", () => {
  assert.equal(isAddAnother("Add another product"), true);
  assert.equal(isViewCart("View cart"), true);
  assert.equal(isRemoveItem("Remove item"), true);
  assert.equal(isCheckout("Checkout"), true);
});

test("adds different items and merges the same product option", () => {
  const draft = {
    items: [],
    productId: "p1",
    productName: "QuickBoil Glass Kettle",
    sku: "KTL-WHT",
    variant: "White",
    variantId: "v1",
    quantity: 2,
    unitPrice: 6500,
    baseUnitPrice: 6500,
    currency: "LKR",
  };
  assert.equal(addCurrentItemToCart(draft).ok, true);
  Object.assign(draft, {
    productId: "p1",
    productName: "QuickBoil Glass Kettle",
    sku: "KTL-WHT",
    variant: "White",
    variantId: "v1",
    quantity: 3,
    unitPrice: 6500,
    baseUnitPrice: 6500,
    currency: "LKR",
  });
  assert.equal(addCurrentItemToCart(draft).ok, true);
  assert.equal(draft.items.length, 1);
  assert.equal(draft.items[0].quantity, 5);
  assert.deepEqual(cartTotals(draft, { deliveryFee: 500 }), {
    subtotal: 32500,
    deliveryFee: 500,
    total: 33000,
  });
  assert.match(cartSummary(draft, "en", { deliveryFee: 500 }), /5 × LKR 6,500\.00 = LKR 32,500\.00/);
});

test("rejects mixed currencies and more than 100 of one option", () => {
  const draft = {
    items: [{
      productId: "p1", productName: "Fan", variantId: "", variant: "",
      quantity: 95, unitPrice: 1000, baseUnitPrice: 1000, currency: "LKR",
    }],
    productId: "p1", productName: "Fan", quantity: 6,
    unitPrice: 1000, baseUnitPrice: 1000, currency: "LKR",
  };
  assert.equal(addCurrentItemToCart(draft).reason, "quantity");
  Object.assign(draft, {
    productId: "p2", productName: "Other", quantity: 1,
    unitPrice: 10, baseUnitPrice: 10, currency: "USD",
  });
  assert.equal(addCurrentItemToCart(draft).reason, "currency");
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

test("WhatsApp interactive choices use their stable action IDs", () => {
  const [button, list] = mapWhatsAppWebhook({
    entry: [{ changes: [{ value: {
      metadata: { phone_number_id: "phone-1" },
      messages: [
        { id: "wa-1", from: "customer", type: "interactive", interactive: { type: "button_reply", button_reply: { id: "Checkout", title: "செக்அவுட்" } } },
        { id: "wa-2", from: "customer", type: "interactive", interactive: { type: "list_reply", list_reply: { id: "Remove 2", title: "2. Fan" } } },
      ],
    } }] }],
  });
  assert.equal(button.textBody, "Checkout");
  assert.equal(list.textBody, "Remove 2");
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

test("legacy orders remain readable when a product reference is absent", async () => {
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

test("order schema accepts a confirmed multi-item cart", async () => {
  const order = new Order({
    companyId: "507f1f77bcf86cd799439011",
    orderNumber: "ORD-MULTI-1",
    sessionId: "web-multi-test",
    channel: "web",
    customer: { name: "Test User", phone: "0771234567", deliveryAddress: "Colombo" },
    items: [
      { name: "Kettle", quantity: 2, unitPrice: 6500, lineTotal: 13000 },
      { name: "Fan", variant: "Black", quantity: 1, unitPrice: 8900, lineTotal: 8900 },
    ],
    subtotal: 21900,
    deliveryFee: 500,
    total: 22400,
    paymentMethod: "Cash on delivery",
    priceStatus: "confirmed",
  });
  await order.validate();
  assert.equal(order.items.length, 2);
  assert.equal(order.total, 22400);
});
