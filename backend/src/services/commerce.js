const crypto = require("crypto");

const Company = require("../models/Company");
const Conversation = require("../models/Conversation");
const Order = require("../models/Order");
const Product = require("../models/Product");

const LANGUAGE_NAMES = { en: "English", si: "සිංහල", ta: "தமிழ்" };

const COPY = {
  en: {
    chooseLanguage: "Please choose your preferred language:\n1. සිංහල\n2. English\n3. தமிழ்",
    welcome: "English selected. You can ask a product question or type ‘order’ to place an order.",
    askProduct: "Which product would you like to order? Send its name, SKU, or number from the list.",
    noProducts: "There are no products available for ordering right now.",
    noProductMatch: "I couldn't identify that product. Please send its name, SKU, or list number.",
    askVariant: "Choose an option:",
    askQuantity: "How many would you like to order?",
    invalidQuantity: "Please enter a quantity between 1 and 100.",
    askName: "What name should we use for this order?",
    askPhone: "What phone number should the seller use for this order?",
    askAddress: "What is the delivery address?",
    askPayment: "Choose a payment method:",
    confirm: "Please check your order:\n{summary}\n\nReply CONFIRM to place it, CHANGE to start again, or CANCEL.",
    cancelled: "The draft order was cancelled. You can type ‘order’ whenever you're ready.",
    restarted: "Let's update the order. Which product would you like?",
    confirmed: "Thank you. Your order {orderNumber} has been placed successfully. The seller will process it soon.",
    unavailable: "That option is currently unavailable. Please choose another one.",
  },
  si: {
    chooseLanguage: "කරුණාකර ඔබ කැමති භාෂාව තෝරන්න:\n1. සිංහල\n2. English\n3. தமிழ்",
    welcome: "සිංහල තෝරා ගත්තා. භාණ්ඩයක් ගැන ප්‍රශ්නයක් අසන්න හෝ ඇණවුමක් කිරීමට ‘ඇණවුම’ ලෙස එවන්න.",
    askProduct: "ඔබ ඇණවුම් කිරීමට කැමති භාණ්ඩයේ නම, SKU අංකය හෝ ලැයිස්තු අංකය එවන්න.",
    noProducts: "දැනට ඇණවුම් කිරීමට භාණ්ඩ නොමැත.",
    noProductMatch: "එම භාණ්ඩය හඳුනාගත නොහැකි විය. නම, SKU අංකය හෝ ලැයිස්තු අංකය එවන්න.",
    askVariant: "විකල්පයක් තෝරන්න:",
    askQuantity: "ඔබට අවශ්‍ය ප්‍රමාණය කොපමණද?",
    invalidQuantity: "කරුණාකර 1 සිට 100 දක්වා ප්‍රමාණයක් ඇතුළත් කරන්න.",
    askName: "මෙම ඇණවුම සඳහා භාවිත කළ යුතු නම කුමක්ද?",
    askPhone: "මෙම ඇණවුම සඳහා සම්බන්ධ කරගත හැකි දුරකථන අංකය කුමක්ද?",
    askAddress: "භාණ්ඩය භාරදිය යුතු ලිපිනය කුමක්ද?",
    askPayment: "ගෙවීම් ක්‍රමයක් තෝරන්න:",
    confirm: "කරුණාකර ඇණවුම පරීක්ෂා කරන්න:\n{summary}\n\nඇණවුම තහවුරු කිරීමට CONFIRM, වෙනස් කිරීමට CHANGE හෝ අවලංගු කිරීමට CANCEL එවන්න.",
    cancelled: "ඇණවුම අවලංගු කළා. නැවත ඇණවුම් කිරීමට ‘ඇණවුම’ ලෙස එවන්න.",
    restarted: "ඇණවුම නැවත සකස් කරමු. ඔබට අවශ්‍ය භාණ්ඩය කුමක්ද?",
    confirmed: "ස්තුතියි. ඔබගේ {orderNumber} ඇණවුම සාර්ථකව ලැබුණා. විකුණුම්කරු එය ඉක්මනින් සකසනු ඇත.",
    unavailable: "එම විකල්පය දැනට නොමැත. වෙනත් එකක් තෝරන්න.",
  },
  ta: {
    chooseLanguage: "உங்களுக்கு விருப்பமான மொழியைத் தேர்ந்தெடுக்கவும்:\n1. සිංහල\n2. English\n3. தமிழ்",
    welcome: "தமிழ் தேர்ந்தெடுக்கப்பட்டது. ஒரு தயாரிப்பைப் பற்றி கேட்கலாம் அல்லது ஆர்டர் செய்ய ‘ஆர்டர்’ என்று அனுப்பலாம்.",
    askProduct: "நீங்கள் ஆர்டர் செய்ய விரும்பும் தயாரிப்பின் பெயர், SKU அல்லது பட்டியல் எண்ணை அனுப்பவும்.",
    noProducts: "தற்போது ஆர்டர் செய்ய தயாரிப்புகள் இல்லை.",
    noProductMatch: "அந்த தயாரிப்பை அடையாளம் காண முடியவில்லை. பெயர், SKU அல்லது பட்டியல் எண்ணை அனுப்பவும்.",
    askVariant: "ஒரு விருப்பத்தைத் தேர்ந்தெடுக்கவும்:",
    askQuantity: "எத்தனை ஆர்டர் செய்ய விரும்புகிறீர்கள்?",
    invalidQuantity: "1 முதல் 100 வரை ஒரு அளவை உள்ளிடவும்.",
    askName: "இந்த ஆர்டருக்கு எந்த பெயரைப் பயன்படுத்த வேண்டும்?",
    askPhone: "இந்த ஆர்டருக்கான தொடர்பு தொலைபேசி எண் என்ன?",
    askAddress: "டெலிவரி முகவரி என்ன?",
    askPayment: "கட்டண முறையைத் தேர்ந்தெடுக்கவும்:",
    confirm: "உங்கள் ஆர்டரைச் சரிபார்க்கவும்:\n{summary}\n\nஆர்டர் செய்ய CONFIRM, மாற்ற CHANGE அல்லது ரத்து செய்ய CANCEL என பதிலளிக்கவும்.",
    cancelled: "வரைவு ஆர்டர் ரத்து செய்யப்பட்டது. மீண்டும் தொடங்க ‘ஆர்டர்’ என்று அனுப்பவும்.",
    restarted: "ஆர்டரை மீண்டும் அமைப்போம். எந்த தயாரிப்பு வேண்டும்?",
    confirmed: "நன்றி. உங்கள் {orderNumber} ஆர்டர் வெற்றிகரமாக பதிவு செய்யப்பட்டது. விற்பனையாளர் விரைவில் செயல்படுத்துவார்.",
    unavailable: "அந்த விருப்பம் தற்போது கிடைக்கவில்லை. வேறொன்றைத் தேர்ந்தெடுக்கவும்.",
  },
};

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function detectLanguage(value) {
  const text = normalize(value);
  if (/^(1|si|sin|sinhala|සිංහල)$/.test(text)) return "si";
  if (/^(2|en|eng|english)$/.test(text)) return "en";
  if (/^(3|ta|tam|tamil|தமிழ்)$/.test(text)) return "ta";
  return "";
}

function localizedText(value, language = "en") {
  if (!value) return "";
  return value[language] || value.en || value.si || value.ta || "";
}

function formatMoney(value, currency) {
  return `${currency || "LKR"} ${Number(value || 0).toFixed(2)}`;
}

function numbered(values) {
  return values.map((value, index) => `${index + 1}. ${value}`).join("\n");
}

function isOrderIntent(text) {
  return /\b(order|buy|purchase|checkout)\b/i.test(text)
    || /(ඇණවුම|මිලදී|ගන්න)/u.test(text)
    || /(ஆர்டர்|வாங்க|கொள்முதல்)/u.test(text);
}

function isCatalogIntent(text) {
  return /\b(products?|catalog|menu|items?)\b/i.test(text)
    || /(භාණ්ඩ|නිෂ්පාදන|ලැයිස්තුව)/u.test(text)
    || /(தயாரிப்பு|பொருட்கள்|பட்டியல்)/u.test(text);
}

function isCancel(text) {
  return /^(cancel|stop|quit|අවලංගු|නවත්වන්න|ரத்து|நிறுத்து)$/iu.test(normalize(text));
}

function isConfirm(text) {
  return /^(confirm|yes|ok|okay|හරි|ඔව්|තහවුරු|ஆம்|சரி|உறுதி)$/iu.test(normalize(text));
}

function isChange(text) {
  return /^(change|edit|restart|වෙනස්|மாற்று|திருத்து)$/iu.test(normalize(text));
}

function choiceIndex(text, length) {
  const number = Number.parseInt(String(text).trim(), 10);
  return Number.isInteger(number) && number >= 1 && number <= length ? number - 1 : -1;
}

function resetDraft(conversation, stage = "browsing") {
  conversation.commerceState = { stage, draft: {}, updatedAt: new Date() };
}

async function addReply(conversation, answer, extra = {}) {
  conversation.messages.push({ role: "assistant", content: answer });
  conversation.commerceState.updatedAt = new Date();
  await conversation.save();
  return { handled: true, answer, sources: [], conversation, ...extra };
}

async function listProducts(companyId, language) {
  const products = await Product.find({ companyId, isActive: true }).sort({ updatedAt: -1 }).limit(20);
  const lines = products.map((product) => {
    const stockText = product.stock === 0 ? " (out of stock)" : "";
    return `${localizedText(product.name, language)} — ${formatMoney(product.price, product.currency)}${stockText}`;
  });
  return { products, text: numbered(lines) };
}

function findProduct(products, text, language) {
  const index = choiceIndex(text, products.length);
  if (index >= 0) return products[index];
  const wanted = normalize(text);
  const exact = products.find((product) =>
    normalize(product.sku) === wanted
    || ["en", "si", "ta"].some((lang) => normalize(product.name?.[lang]) === wanted)
  );
  if (exact) return exact;
  const matches = products.filter((product) => {
    const values = [product.sku, product.name?.[language], product.name?.en, product.name?.si, product.name?.ta]
      .map(normalize)
      .filter(Boolean);
    return values.some((value) => value.includes(wanted) || wanted.includes(value));
  });
  return matches.length === 1 ? matches[0] : null;
}

function orderSummary(draft, language, settings) {
  const currency = draft.currency || settings.currency || "LKR";
  const unitPrice = Number(draft.unitPrice || 0);
  const quantity = Number(draft.quantity || 0);
  const subtotal = unitPrice * quantity;
  const deliveryFee = Number(settings.deliveryFee || 0);
  const labels = language === "si"
    ? ["භාණ්ඩය", "ප්‍රමාණය", "නම", "දුරකථනය", "ලිපිනය", "ගෙවීම", "මුළු එකතුව"]
    : language === "ta"
      ? ["தயாரிப்பு", "அளவு", "பெயர்", "தொலைபேசி", "முகவரி", "கட்டணம்", "மொத்தம்"]
      : ["Product", "Quantity", "Name", "Phone", "Address", "Payment", "Total"];
  return [
    `${labels[0]}: ${draft.productName}${draft.variant ? ` (${draft.variant})` : ""}`,
    `${labels[1]}: ${quantity}`,
    `${labels[2]}: ${draft.customerName}`,
    `${labels[3]}: ${draft.customerPhone || "-"}`,
    `${labels[4]}: ${draft.deliveryAddress}`,
    `${labels[5]}: ${draft.paymentMethod}`,
    `${labels[6]}: ${formatMoney(subtotal + deliveryFee, currency)}`,
  ].join("\n");
}

async function createOrderNumber() {
  return `ORD-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

async function getConversation({ companyId, sessionId, channel, customer = {} }) {
  let conversation = await Conversation.findOne({ companyId, sessionId });
  if (!conversation) {
    conversation = new Conversation({
      companyId,
      sessionId,
      channel,
      customerName: customer.name || "",
      customerPhone: customer.phone || "",
      customerExternalId: customer.externalId || "",
      customerAuthProvider: channel,
      messages: [],
    });
  } else {
    if (customer.name) conversation.customerName = customer.name;
    if (customer.phone) conversation.customerPhone = customer.phone;
    if (customer.externalId) conversation.customerExternalId = customer.externalId;
  }
  return conversation;
}

async function processCommerceMessage({ companyId, sessionId, channel, text, customer = {} }) {
  const company = await Company.findById(companyId);
  if (!company || !company.isActive) throw new Error("Company is unavailable");
  const conversation = await getConversation({ companyId, sessionId, channel, customer });
  const message = String(text || "").trim();
  conversation.messages.push({ role: "user", content: message });

  const requestedLanguage = detectLanguage(message);
  if (!conversation.preferredLanguage) {
    if (!requestedLanguage) return addReply(conversation, COPY.en.chooseLanguage);
    conversation.preferredLanguage = requestedLanguage;
    resetDraft(conversation);
    return addReply(conversation, COPY[requestedLanguage].welcome, { language: requestedLanguage });
  }

  const language = conversation.preferredLanguage;
  const copy = COPY[language] || COPY.en;
  if (requestedLanguage && requestedLanguage !== language) {
    conversation.preferredLanguage = requestedLanguage;
    return addReply(conversation, COPY[requestedLanguage].welcome, { language: requestedLanguage });
  }

  const state = conversation.commerceState || { stage: "browsing", draft: {} };
  const draft = state.draft || {};
  const settings = company.commerceSettings || {};

  if (state.stage !== "browsing" && isCancel(message)) {
    resetDraft(conversation);
    return addReply(conversation, copy.cancelled);
  }

  if (state.stage === "browsing") {
    if (isCatalogIntent(message)) {
      const catalog = await listProducts(companyId, language);
      return addReply(conversation, catalog.products.length ? catalog.text : copy.noProducts);
    }
    if (!settings.orderingEnabled || !isOrderIntent(message)) {
      await conversation.save();
      return { handled: false, conversation, language };
    }
    const catalog = await listProducts(companyId, language);
    if (!catalog.products.length) return addReply(conversation, copy.noProducts);
    state.stage = "awaiting_product";
    state.draft = {};
    conversation.commerceState = state;
    return addReply(conversation, `${copy.askProduct}\n\n${catalog.text}`);
  }

  if (state.stage === "awaiting_product") {
    const catalog = await listProducts(companyId, language);
    const product = findProduct(catalog.products, message, language);
    if (!product || product.stock === 0) {
      return addReply(conversation, `${product ? copy.unavailable : copy.noProductMatch}\n\n${catalog.text}`);
    }
    Object.assign(draft, {
      productId: product._id.toString(),
      sku: product.sku,
      productName: localizedText(product.name, language),
      unitPrice: product.price,
      currency: product.currency,
    });
    const variants = product.variants.filter((variant) => variant.isActive && variant.stock !== 0);
    if (variants.length) {
      draft.variants = variants.map((variant) => ({
        id: variant._id.toString(),
        name: variant.name,
        priceAdjustment: variant.priceAdjustment || 0,
      }));
      state.stage = "awaiting_variant";
      state.draft = draft;
      return addReply(conversation, `${copy.askVariant}\n${numbered(variants.map((variant) => variant.name))}`);
    }
    state.stage = "awaiting_quantity";
    state.draft = draft;
    return addReply(conversation, copy.askQuantity);
  }

  if (state.stage === "awaiting_variant") {
    const variants = draft.variants || [];
    const index = choiceIndex(message, variants.length);
    const variant = index >= 0
      ? variants[index]
      : variants.find((item) => normalize(item.name) === normalize(message));
    if (!variant) return addReply(conversation, `${copy.unavailable}\n${numbered(variants.map((item) => item.name))}`);
    draft.variant = variant.name;
    draft.unitPrice = Number(draft.unitPrice) + Number(variant.priceAdjustment || 0);
    delete draft.variants;
    state.stage = "awaiting_quantity";
    state.draft = draft;
    return addReply(conversation, copy.askQuantity);
  }

  if (state.stage === "awaiting_quantity") {
    const quantity = Number.parseInt(message, 10);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
      return addReply(conversation, copy.invalidQuantity);
    }
    draft.quantity = quantity;
    if (conversation.customerName) {
      draft.customerName = conversation.customerName;
      if (conversation.customerPhone) {
        draft.customerPhone = conversation.customerPhone;
        state.stage = "awaiting_address";
        state.draft = draft;
        return addReply(conversation, copy.askAddress);
      }
      state.stage = "awaiting_phone";
      state.draft = draft;
      return addReply(conversation, copy.askPhone);
    }
    state.stage = "awaiting_name";
    state.draft = draft;
    return addReply(conversation, copy.askName);
  }

  if (state.stage === "awaiting_name") {
    if (message.length < 2) return addReply(conversation, copy.askName);
    draft.customerName = message.slice(0, 120);
    conversation.customerName = draft.customerName;
    if (conversation.customerPhone) {
      draft.customerPhone = conversation.customerPhone;
      state.stage = "awaiting_address";
      state.draft = draft;
      return addReply(conversation, copy.askAddress);
    }
    state.stage = "awaiting_phone";
    state.draft = draft;
    return addReply(conversation, copy.askPhone);
  }

  if (state.stage === "awaiting_phone") {
    if (!/^[+\d][\d\s()-]{6,24}$/.test(message)) return addReply(conversation, copy.askPhone);
    draft.customerPhone = message;
    conversation.customerPhone = message;
    state.stage = "awaiting_address";
    state.draft = draft;
    return addReply(conversation, copy.askAddress);
  }

  if (state.stage === "awaiting_address") {
    if (message.length < 5) return addReply(conversation, copy.askAddress);
    draft.deliveryAddress = message.slice(0, 500);
    const methods = settings.paymentMethods?.length
      ? settings.paymentMethods
      : ["Cash on delivery", "Bank transfer"];
    draft.paymentMethods = methods;
    state.stage = "awaiting_payment";
    state.draft = draft;
    return addReply(conversation, `${copy.askPayment}\n${numbered(methods)}`);
  }

  if (state.stage === "awaiting_payment") {
    const methods = draft.paymentMethods || ["Cash on delivery"];
    const index = choiceIndex(message, methods.length);
    const method = index >= 0 ? methods[index] : methods.find((item) => normalize(item) === normalize(message));
    if (!method) return addReply(conversation, `${copy.askPayment}\n${numbered(methods)}`);
    draft.paymentMethod = method;
    delete draft.paymentMethods;
    state.stage = "awaiting_confirmation";
    state.draft = draft;
    const summary = orderSummary(draft, language, settings);
    return addReply(conversation, copy.confirm.replace("{summary}", summary));
  }

  if (state.stage === "awaiting_confirmation") {
    if (isChange(message)) {
      resetDraft(conversation, "awaiting_product");
      return addReply(conversation, copy.restarted);
    }
    if (!isConfirm(message)) {
      const summary = orderSummary(draft, language, settings);
      return addReply(conversation, copy.confirm.replace("{summary}", summary));
    }
    const subtotal = Number(draft.unitPrice) * Number(draft.quantity);
    const deliveryFee = Number(settings.deliveryFee || 0);
    const order = await Order.create({
      companyId,
      orderNumber: await createOrderNumber(),
      conversationId: conversation._id,
      sessionId,
      channel,
      language,
      customer: {
        name: draft.customerName,
        phone: draft.customerPhone || "",
        externalId: customer.externalId || conversation.customerExternalId || "",
        deliveryAddress: draft.deliveryAddress,
      },
      items: [{
        productId: draft.productId,
        sku: draft.sku,
        name: draft.productName,
        variant: draft.variant || "",
        quantity: draft.quantity,
        unitPrice: draft.unitPrice,
        lineTotal: subtotal,
      }],
      subtotal,
      deliveryFee,
      total: subtotal + deliveryFee,
      currency: draft.currency || settings.currency || "LKR",
      paymentMethod: draft.paymentMethod,
    });
    resetDraft(conversation);
    return addReply(
      conversation,
      copy.confirmed.replace("{orderNumber}", order.orderNumber),
      { order }
    );
  }

  resetDraft(conversation);
  return addReply(conversation, copy.welcome);
}

module.exports = {
  COPY,
  LANGUAGE_NAMES,
  detectLanguage,
  localizedText,
  processCommerceMessage,
};
