const crypto = require("crypto");

const Company = require("../models/Company");
const Conversation = require("../models/Conversation");
const Order = require("../models/Order");
const Product = require("../models/Product");

const LANGUAGE_NAMES = { en: "English", si: "සිංහල", ta: "தமிழ்" };
const LANGUAGE_SUGGESTIONS = [
  { label: "සිංහල", message: "සිංහල" },
  { label: "English", message: "English" },
  { label: "தமிழ்", message: "தமிழ்" },
];

const ACTION_LABELS = {
  en: { back: "Back", cancel: "Cancel" },
  si: { back: "ආපසු", cancel: "අවලංගු කරන්න" },
  ta: { back: "பின்செல்", cancel: "ரத்து செய்" },
};

const COPY = {
  en: {
    chooseLanguage: "Please choose your preferred language:",
    welcome: "English selected. You can ask a product question or type ‘order’ to place an order.",
    askProduct: "Which product would you like to order? Choose an available product or send its name or SKU.",
    noProducts: "There are no products available for ordering right now.",
    noProductMatch: "I couldn't identify that product. Please send its name, SKU, or list number.",
    askVariant: "Choose an option:",
    askQuantity: "How many would you like to order?",
    invalidQuantity: "Please enter a quantity between 1 and 100.",
    chooseOrderAction: "Would you like to go back or cancel this order?",
    askName: "What name should we use for this order?",
    askPhone: "What phone number should the seller use for this order?",
    askAddress: "What is the delivery address?",
    askPayment: "Choose a payment method:",
    confirm: "Please check your order:\n{summary}\n\nChoose Confirm to place it, Change to start again, or Cancel.",
    cancelled: "The draft order was cancelled. You can type ‘order’ whenever you're ready.",
    restarted: "Let's update the order. Which product would you like?",
    confirmed: "Thank you. Your order {orderNumber} has been placed successfully. The seller will process it soon.",
    unavailable: "That option is currently unavailable. Please choose another one.",
    priceChanged: "The catalogue price changed while you were ordering. Please review the updated total before confirming:",
  },
  si: {
    chooseLanguage: "කරුණාකර ඔබ කැමති භාෂාව තෝරන්න:",
    welcome: "සිංහල තෝරා ගත්තා. භාණ්ඩයක් ගැන ප්‍රශ්නයක් අසන්න හෝ ඇණවුමක් කිරීමට ‘ඇණවුම’ ලෙස එවන්න.",
    askProduct: "ඔබ ඇණවුම් කිරීමට කැමති භාණ්ඩය තෝරන්න, නැතහොත් එහි නම හෝ SKU අංකය එවන්න.",
    noProducts: "දැනට ඇණවුම් කිරීමට භාණ්ඩ නොමැත.",
    noProductMatch: "එම භාණ්ඩය හඳුනාගත නොහැකි විය. නම, SKU අංකය හෝ ලැයිස්තු අංකය එවන්න.",
    askVariant: "විකල්පයක් තෝරන්න:",
    askQuantity: "ඔබට අවශ්‍ය ප්‍රමාණය කොපමණද?",
    invalidQuantity: "කරුණාකර 1 සිට 100 දක්වා ප්‍රමාණයක් ඇතුළත් කරන්න.",
    chooseOrderAction: "ඔබට ආපසු යාමට හෝ මෙම ඇණවුම අවලංගු කිරීමට අවශ්‍යද?",
    askName: "මෙම ඇණවුම සඳහා භාවිත කළ යුතු නම කුමක්ද?",
    askPhone: "මෙම ඇණවුම සඳහා සම්බන්ධ කරගත හැකි දුරකථන අංකය කුමක්ද?",
    askAddress: "භාණ්ඩය භාරදිය යුතු ලිපිනය කුමක්ද?",
    askPayment: "ගෙවීම් ක්‍රමයක් තෝරන්න:",
    confirm: "කරුණාකර ඇණවුම පරීක්ෂා කරන්න:\n{summary}\n\nඇණවුම තහවුරු කිරීමට CONFIRM, වෙනස් කිරීමට CHANGE හෝ අවලංගු කිරීමට CANCEL එවන්න.",
    cancelled: "ඇණවුම අවලංගු කළා. නැවත ඇණවුම් කිරීමට ‘ඇණවුම’ ලෙස එවන්න.",
    restarted: "ඇණවුම නැවත සකස් කරමු. ඔබට අවශ්‍ය භාණ්ඩය කුමක්ද?",
    confirmed: "ස්තුතියි. ඔබගේ {orderNumber} ඇණවුම සාර්ථකව ලැබුණා. විකුණුම්කරු එය ඉක්මනින් සකසනු ඇත.",
    unavailable: "එම විකල්පය දැනට නොමැත. වෙනත් එකක් තෝරන්න.",
    priceChanged: "ඔබ ඇණවුම් කරන අතරතුර නාමාවලි මිල වෙනස් විය. තහවුරු කිරීමට පෙර යාවත්කාලීන කළ මුළු මුදල පරීක්ෂා කරන්න:",
  },
  ta: {
    chooseLanguage: "உங்களுக்கு விருப்பமான மொழியைத் தேர்ந்தெடுக்கவும்:",
    welcome: "தமிழ் தேர்ந்தெடுக்கப்பட்டது. ஒரு தயாரிப்பைப் பற்றி கேட்கலாம் அல்லது ஆர்டர் செய்ய ‘ஆர்டர்’ என்று அனுப்பலாம்.",
    askProduct: "நீங்கள் ஆர்டர் செய்ய விரும்பும் தயாரிப்பைத் தேர்ந்தெடுக்கவும் அல்லது அதன் பெயர் அல்லது SKU-ஐ அனுப்பவும்.",
    noProducts: "தற்போது ஆர்டர் செய்ய தயாரிப்புகள் இல்லை.",
    noProductMatch: "அந்த தயாரிப்பை அடையாளம் காண முடியவில்லை. பெயர், SKU அல்லது பட்டியல் எண்ணை அனுப்பவும்.",
    askVariant: "ஒரு விருப்பத்தைத் தேர்ந்தெடுக்கவும்:",
    askQuantity: "எத்தனை ஆர்டர் செய்ய விரும்புகிறீர்கள்?",
    invalidQuantity: "1 முதல் 100 வரை ஒரு அளவை உள்ளிடவும்.",
    chooseOrderAction: "நீங்கள் பின்செல்ல விரும்புகிறீர்களா அல்லது இந்த ஆர்டரை ரத்து செய்ய விரும்புகிறீர்களா?",
    askName: "இந்த ஆர்டருக்கு எந்த பெயரைப் பயன்படுத்த வேண்டும்?",
    askPhone: "இந்த ஆர்டருக்கான தொடர்பு தொலைபேசி எண் என்ன?",
    askAddress: "டெலிவரி முகவரி என்ன?",
    askPayment: "கட்டண முறையைத் தேர்ந்தெடுக்கவும்:",
    confirm: "உங்கள் ஆர்டரைச் சரிபார்க்கவும்:\n{summary}\n\nஆர்டர் செய்ய CONFIRM, மாற்ற CHANGE அல்லது ரத்து செய்ய CANCEL என பதிலளிக்கவும்.",
    cancelled: "வரைவு ஆர்டர் ரத்து செய்யப்பட்டது. மீண்டும் தொடங்க ‘ஆர்டர்’ என்று அனுப்பவும்.",
    restarted: "ஆர்டரை மீண்டும் அமைப்போம். எந்த தயாரிப்பு வேண்டும்?",
    confirmed: "நன்றி. உங்கள் {orderNumber} ஆர்டர் வெற்றிகரமாக பதிவு செய்யப்பட்டது. விற்பனையாளர் விரைவில் செயல்படுத்துவார்.",
    unavailable: "அந்த விருப்பம் தற்போது கிடைக்கவில்லை. வேறொன்றைத் தேர்ந்தெடுக்கவும்.",
    priceChanged: "நீங்கள் ஆர்டர் செய்யும் போது பட்டியல் விலை மாறியுள்ளது. உறுதிப்படுத்துவதற்கு முன் புதுப்பிக்கப்பட்ட மொத்தத்தைச் சரிபார்க்கவும்:",
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

function detectExplicitLanguage(value) {
  const text = normalize(value);
  if (/^(si|sin|sinhala|සිංහල)$/.test(text)) return "si";
  if (/^(en|eng|english)$/.test(text)) return "en";
  if (/^(ta|tam|tamil|தமிழ்)$/.test(text)) return "ta";
  return "";
}

function localizedText(value, language = "en") {
  if (!value) return "";
  return value[language] || value.en || value.si || value.ta || "";
}

function isOrderIntent(text) {
  return /\b(order|buy|purchase|checkout)\b/i.test(text)
    || /(ඇණවුම|මිලදී|ගන්න)/u.test(text)
    || /(ஆர்டர்|வாங்க|கொள்முதல்)/u.test(text);
}

function isCancel(text) {
  const value = normalize(text);
  return /^(?:please\s+)?(?:cancel|stop|quit)(?:\s+(?:my|the|this))?(?:\s+order)?(?:\s+please)?$/iu.test(value)
    || /^(?:never\s*mind|i\s+(?:do\s*not|don't)\s+want\s+(?:it|this|the\s+order))$/iu.test(value)
    || /^(?:අවලංගු(?:\s+කරන්න)?|නවත්වන්න|ඇණවුම\s+අවලංගු(?:\s+කරන්න)?)$/u.test(value)
    || /^(?:ரத்து(?:\s+செய்|\s+செய்யவும்)?|நிறுத்து|ஆர்டரை\s+ரத்து(?:\s+செய்)?)$/u.test(value);
}

function isBack(text) {
  return /^(?:back|go\s+back|previous|ආපසු|பின்செல்)$/iu.test(normalize(text));
}

function isLanguageRequest(text) {
  const value = normalize(text);
  const languageWord = "(?:language|lanaguage|langauge)";
  return new RegExp(`^(?:change|select|switch|choose)?\\s*(?:the\\s+)?${languageWord}(?:\\s+please)?$`, "iu").test(value)
    || new RegExp(`^(?:can|could|may)\\s+i\\s+(?:change|switch|select)\\s+(?:the\\s+)?${languageWord}\\??$`, "iu").test(value)
    || /^(?:භාෂාව|භාෂාව\s+වෙනස්(?:\s+කරන්න)?|மொழி|மொழியை\s+மாற்று)$/u.test(value);
}

function isHelp(text) {
  return /^(?:help|help\s+me|what\s+should\s+i\s+do|උදව්|உதவி)$/iu.test(normalize(text));
}

function isNegative(text) {
  return /^(?:no|nope|nah|නැහැ|එපා|இல்லை|வேண்டாம்)$/iu.test(normalize(text));
}

function normalizeIdentifier(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function isValidQuantity(text) {
  if (!/^\d{1,3}$/.test(String(text || "").trim())) return false;
  const quantity = Number(text);
  return Number.isInteger(quantity) && quantity >= 1 && quantity <= 100;
}

function isPlausibleName(text) {
  const value = String(text || "").trim();
  return value.length >= 2
    && value.length <= 120
    && /\p{L}/u.test(value)
    && !/[?]/.test(value)
    && !isCancel(value)
    && !isBack(value)
    && !isLanguageRequest(value);
}

function isPlausiblePhone(text) {
  const value = String(text || "").trim();
  if (!/^\+?[\d\s()-]+$/.test(value)) return false;
  const digits = value.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) return false;
  if (/^(\d)\1+$/.test(digits)) return false;
  return !["0123456789", "123456789", "987654321", "9876543210"].includes(digits);
}

function isPlausibleAddress(text) {
  const value = String(text || "").trim();
  return value.length >= 5
    && value.length <= 500
    && /\p{L}/u.test(value)
    && !isCancel(value)
    && !isBack(value)
    && !isLanguageRequest(value);
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

function actionSuggestions(language, { back = true, cancel = true } = {}) {
  const labels = ACTION_LABELS[language] || ACTION_LABELS.en;
  return [
    ...(back ? [{ label: labels.back, message: "Back" }] : []),
    ...(cancel ? [{ label: labels.cancel, message: "Cancel" }] : []),
  ];
}

function formatMoney(amount, currency = "LKR") {
  const value = Number(amount || 0);
  return `${String(currency || "LKR").toUpperCase()} ${value.toLocaleString("en-LK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function catalogProductNames(product) {
  return [...new Set([
    product?.name,
    product?.sku,
    ...(product?.alternateNames || []),
  ].map((value) => String(value || "").trim()).filter(Boolean))];
}

function resolveCatalogProduct(catalog, text) {
  const products = Array.isArray(catalog?.products) ? catalog.products : [];
  const index = choiceIndex(text, products.length);
  if (index >= 0) return products[index];

  const normalizedMessage = normalizeIdentifier(text);
  if (!normalizedMessage) return null;
  const matchingProducts = products.filter((product) => {
    const identifiers = catalogProductNames(product)
      .map(normalizeIdentifier)
      .filter((value) => value.length >= 4);
    return identifiers.some((identifier) => (
      normalizedMessage === identifier
      || normalizedMessage.includes(identifier)
    ));
  });
  return matchingProducts.length === 1 ? matchingProducts[0] : null;
}

async function loadProductCatalog(companyId, language = "en") {
  const records = await Product.find({ companyId, isActive: true })
    .sort({ createdAt: 1, _id: 1 })
    .lean();
  return {
    products: records.map((product) => ({
      productId: String(product._id),
      sku: product.sku || "",
      name: localizedText(product.name, language),
      alternateNames: Object.values(product.name || {}).filter(Boolean),
      description: localizedText(product.description, language),
      price: Number(product.price || 0),
      currency: product.currency || "LKR",
      stock: product.stock,
      imageUrl: product.imageUrl || "",
      variants: (product.variants || [])
        .filter((variant) => variant.isActive !== false)
        .map((variant) => ({
          id: String(variant._id || ""),
          name: variant.name,
          sku: variant.sku || "",
          priceAdjustment: Number(variant.priceAdjustment || 0),
          stock: variant.stock,
        })),
    })),
  };
}

function isCatalogListIntent(text) {
  const value = normalize(text);
  return /^(?:products?|items?|catalog(?:ue)?)$/iu.test(value)
    || /\b(?:what|which|show|list|see|view)\b.{0,30}\b(?:products?|items?|catalog(?:ue)?)\b/iu.test(value)
    || /\b(?:products?|items?|catalog(?:ue)?)\b.{0,30}\b(?:have|available|sell|offer)\b/iu.test(value)
    || /\bwhat\s+do\s+(?:you|u)\s+(?:have|sell|offer)\b/iu.test(value)
    || /\bmonawada\b.{0,30}\b(?:products?|items?)\b|\b(?:products?|items?)\b.{0,30}\bthiyen/iu.test(value)
    || /\benna\b.{0,30}\b(?:products?|items?)\b|\b(?:products?|items?)\b.{0,30}\birukk/iu.test(value)
    || /(?:මොනවාද|කුමන).{0,30}(?:භාණ්ඩ|නිෂ්පාදන)/u.test(value)
    || /(?:භාණ්ඩ|නිෂ්පාදන).{0,30}(?:තියෙන්නේ|තිබේ|පෙන්වන්න)/u.test(value)
    || /(?:என்ன|எந்த).{0,30}(?:தயாரிப்புகள்|பொருட்கள்)/u.test(value)
    || /(?:தயாரிப்புகள்|பொருட்கள்).{0,30}(?:உள்ளன|காட்டு)/u.test(value);
}

function isCommercialProductIntent(text) {
  const value = normalize(text);
  return /\b(?:price|cost|how\s+much|available|availability|in\s+stock|do\s+(?:you|u)\s+have|sell|variants?|options?|colou?rs?|sizes?)\b/iu.test(value)
    || /(?:මිල|කීයද|තිබේද|තියෙනවාද|විකුණනවාද|විකල්ප|වර්ණ|ප්‍රමාණ)/u.test(value)
    || /(?:விலை|எவ்வளவு|கிடைக்குமா|உள்ளதா|விற்கிறீர்களா|விருப்பங்கள்|நிறங்கள்|அளவுகள்)/u.test(value);
}

function productSuggestions(catalog, language, { order = false } = {}) {
  return (catalog?.products || []).slice(0, 12).map((product) => ({
    label: `${product.name} · ${formatMoney(product.price, product.currency)}`,
    message: order ? product.name : `Tell me about ${product.name}`,
  }));
}

function catalogListAnswer(catalog, language) {
  const products = catalog?.products || [];
  const heading = language === "si"
    ? "දැනට ලබා ගත හැකි භාණ්ඩ:"
    : language === "ta"
      ? "தற்போது கிடைக்கும் தயாரிப்புகள்:"
      : "Here are the products currently available:";
  const help = language === "si"
    ? "වැඩි විස්තර සඳහා භාණ්ඩයක් තෝරන්න, නැතහොත් ඇණවුම් කිරීමට ‘ඇණවුම’ එවන්න."
    : language === "ta"
      ? "மேலும் விவரங்களுக்கு ஒரு தயாரிப்பைத் தேர்ந்தெடுக்கவும் அல்லது ஆர்டர் செய்ய ‘order’ என அனுப்பவும்."
      : "Choose a product for more details, or send ‘order’ to place an order.";
  return `${heading}\n\n${products.map((product, index) => (
    `${index + 1}. ${product.name} (${product.sku}) — ${formatMoney(product.price, product.currency)}`
  )).join("\n")}\n\n${help}`;
}

function commercialProductAnswer(product, language) {
  const optionNames = (product.variants || []).map((variant) => variant.name).filter(Boolean);
  const availability = language === "si"
    ? "මෙම භාණ්ඩය ඇණවුම් කිරීමට ලබා ගත හැක."
    : language === "ta"
      ? "இந்த தயாரிப்பு ஆர்டர் செய்யக் கிடைக்கிறது."
      : "This product is available to order.";
  const priceLabel = language === "si" ? "මිල" : language === "ta" ? "விலை" : "Price";
  const skuLabel = "SKU";
  const optionsLabel = language === "si" ? "විකල්ප" : language === "ta" ? "விருப்பங்கள்" : "Options";
  const detailPrompt = language === "si"
    ? "පිරිවිතර හෝ වගකීම වැනි වැඩි විස්තරද මගෙන් අසන්න පුළුවන්."
    : language === "ta"
      ? "விவரக்குறிப்புகள் அல்லது உத்தரவாதம் போன்ற கூடுதல் தகவல்களையும் கேட்கலாம்."
      : "You can also ask for specifications, usage, warranty, or other details.";
  return [
    `${product.name}`,
    `${priceLabel}: ${formatMoney(product.price, product.currency)}`,
    `${skuLabel}: ${product.sku}`,
    ...(optionNames.length ? [`${optionsLabel}: ${optionNames.join(", ")}`] : []),
    "",
    availability,
    detailPrompt,
  ].join("\n");
}

function productMedia(product) {
  if (!product?.imageUrl) return [];
  return [{
    url: product.imageUrl,
    altText: product.name || "Product image",
    documentId: "",
    documentName: "Product catalogue",
    mimeType: "image",
  }];
}

function stageResponse(state, copy, language, catalog, settings) {
  if (state.stage === "awaiting_product") {
    return {
      answer: copy.askProduct,
      suggestions: [...productSuggestions(catalog, language, { order: true }), ...actionSuggestions(language, { back: false })],
    };
  }
  if (state.stage === "awaiting_variant") {
    return {
      answer: copy.askVariant,
      suggestions: [
        ...(state.draft?.variants || []).map((variant) => ({
          label: `${variant.name} · ${formatMoney(
            Number(state.draft?.baseUnitPrice || 0) + Number(variant.priceAdjustment || 0),
            state.draft?.currency || settings.currency || "LKR"
          )}`,
          message: variant.name,
        })),
        ...actionSuggestions(language),
      ],
    };
  }
  if (state.stage === "awaiting_quantity") {
    return { answer: copy.askQuantity, suggestions: actionSuggestions(language) };
  }
  if (state.stage === "awaiting_name") {
    return { answer: copy.askName, suggestions: actionSuggestions(language) };
  }
  if (state.stage === "awaiting_phone") {
    return { answer: copy.askPhone, suggestions: actionSuggestions(language) };
  }
  if (state.stage === "awaiting_address") {
    return { answer: copy.askAddress, suggestions: actionSuggestions(language) };
  }
  if (state.stage === "awaiting_payment") {
    const methods = state.draft?.paymentMethods || settings.paymentMethods || ["Cash on delivery"];
    return {
      answer: copy.askPayment,
      suggestions: [
        ...methods.map((method) => ({ label: method, message: method })),
        ...actionSuggestions(language),
      ],
    };
  }
  if (state.stage === "awaiting_confirmation") {
    const summary = orderSummary(state.draft || {}, language, settings);
    return {
      answer: copy.confirm.replace("{summary}", summary),
      suggestions: ["Confirm", "Change", "Cancel"].map((item) => ({ label: item, message: item })),
    };
  }
  return { answer: copy.welcome, suggestions: [] };
}

function previousOrderStage(stage) {
  return {
    awaiting_variant: "awaiting_product",
    awaiting_quantity: "awaiting_product",
    awaiting_name: "awaiting_quantity",
    awaiting_phone: "awaiting_name",
    awaiting_address: "awaiting_phone",
    awaiting_payment: "awaiting_address",
    awaiting_confirmation: "awaiting_payment",
  }[stage] || "awaiting_product";
}

function resetDraft(conversation, stage = "browsing") {
  conversation.commerceState = { stage, draft: {}, updatedAt: new Date() };
}

async function addReply(conversation, answer, extra = {}) {
  const media = Array.isArray(extra.media) ? extra.media : [];
  conversation.messages.push({ role: "assistant", content: answer, media });
  conversation.commerceState.updatedAt = new Date();
  // `draft` is a Mixed field, so Mongoose cannot detect mutations to its
  // nested properties unless the parent commerce state is marked dirty.
  conversation.markModified("commerceState");
  await conversation.save();
  return { handled: true, answer, sources: [], conversation, ...extra };
}

function orderSummary(draft, language, settings) {
  const quantity = Number(draft.quantity || 0);
  const subtotal = Number(draft.unitPrice || 0) * quantity;
  const deliveryFee = Number(settings.deliveryFee || 0);
  const total = subtotal + deliveryFee;
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
    `${labels[6]}: ${formatMoney(total, draft.currency || settings.currency || "LKR")}`,
  ].join("\n");
}

function hasCompleteDraft(draft) {
  return Boolean(
    draft.productName
    && Number.isInteger(Number(draft.quantity))
    && Number(draft.quantity) > 0
    && draft.customerName
    && draft.customerPhone
    && draft.deliveryAddress
    && draft.paymentMethod
  );
}

async function createOrderNumber() {
  return `ORD-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

function selectProductForOrder(state, product) {
  const draft = state.draft || {};
  Object.assign(draft, {
    productId: product.productId,
    productName: product.name.slice(0, 200),
    sku: product.sku || "",
    unitPrice: Number(product.price || 0),
    baseUnitPrice: Number(product.price || 0),
    currency: product.currency || "LKR",
    variants: product.variants || [],
  });
  delete draft.variant;
  state.stage = draft.variants.length ? "awaiting_variant" : "awaiting_quantity";
  state.draft = draft;
  return state;
}

async function refreshDraftProduct(companyId, draft, language) {
  if (!draft.productId) return { available: false, priceChanged: false };
  const product = await Product.findOne({
    _id: draft.productId,
    companyId,
    isActive: true,
  }).lean();
  if (!product) return { available: false, priceChanged: false };

  let variant = null;
  if (draft.variant) {
    variant = (product.variants || []).find((item) => (
      item.isActive !== false
      && (
        String(item._id || "") === String(draft.variantId || "")
        || normalize(item.name) === normalize(draft.variant)
      )
    ));
    if (!variant) return { available: false, priceChanged: false };
  }

  const currentPrice = Number(product.price || 0) + Number(variant?.priceAdjustment || 0);
  const priceChanged = currentPrice !== Number(draft.unitPrice || 0)
    || String(product.currency || "LKR") !== String(draft.currency || "LKR");
  draft.productName = localizedText(product.name, language);
  draft.sku = variant?.sku || product.sku || "";
  draft.unitPrice = currentPrice;
  draft.baseUnitPrice = Number(product.price || 0);
  draft.currency = product.currency || "LKR";
  return { available: true, priceChanged };
}

async function getConversation({ companyId, sessionId, channel, customer = {} }) {
  let conversation = await Conversation.findOne({ companyId, sessionId });
  if (!conversation) {
    conversation = new Conversation({
      companyId,
      sessionId,
      channel,
      customerName: customer.name || "",
      customerEmail: customer.email || "",
      customerPhone: customer.phone || "",
      customerExternalId: customer.externalId || "",
      customerAuthProvider: customer.authProvider || channel,
      messages: [],
    });
  } else {
    if (customer.name) conversation.customerName = customer.name;
    if (customer.email) conversation.customerEmail = customer.email;
    if (customer.phone) conversation.customerPhone = customer.phone;
    if (customer.externalId) conversation.customerExternalId = customer.externalId;
    if (customer.authProvider) conversation.customerAuthProvider = customer.authProvider;
  }
  return conversation;
}

async function processCommerceMessage({ companyId, sessionId, channel, text, customer = {} }) {
  const company = await Company.findById(companyId);
  if (!company || !company.isActive) throw new Error("Company is unavailable");
  const conversation = await getConversation({ companyId, sessionId, channel, customer });
  const message = String(text || "").trim();
  conversation.messages.push({ role: "user", content: message });
  const currentState = conversation.commerceState || { stage: "browsing", draft: {} };

  if (!conversation.preferredLanguage) {
    const requestedLanguage = detectLanguage(message);
    if (!requestedLanguage) {
      return addReply(conversation, COPY.en.chooseLanguage, { suggestions: LANGUAGE_SUGGESTIONS });
    }
    conversation.preferredLanguage = requestedLanguage;
    if (currentState.stage === "awaiting_language") {
      currentState.stage = currentState.draft?._resumeStage || "browsing";
      if (currentState.draft) delete currentState.draft._resumeStage;
      conversation.commerceState = currentState;
      const catalog = currentState.stage === "awaiting_product"
        ? await loadProductCatalog(companyId, requestedLanguage)
        : { products: [] };
      const response = stageResponse(
        currentState,
        COPY[requestedLanguage],
        requestedLanguage,
        catalog,
        company.commerceSettings || {}
      );
      return addReply(conversation, response.answer, {
        language: requestedLanguage,
        suggestions: response.suggestions,
      });
    }
    resetDraft(conversation);
    return addReply(conversation, COPY[requestedLanguage].welcome, { language: requestedLanguage });
  }

  let language = conversation.preferredLanguage;
  let copy = COPY[language] || COPY.en;
  const state = conversation.commerceState || { stage: "browsing", draft: {} };
  const requestedLanguage = detectExplicitLanguage(message);
  if (requestedLanguage) {
    if (requestedLanguage !== language) {
      conversation.preferredLanguage = requestedLanguage;
      language = requestedLanguage;
      copy = COPY[language];
    }
    const catalog = state.stage === "awaiting_product"
      ? await loadProductCatalog(companyId, language)
      : { products: [] };
    const response = stageResponse(state, copy, language, catalog, company.commerceSettings || {});
    return addReply(conversation, response.answer, {
      language,
      suggestions: response.suggestions,
    });
  }

  const draft = state.draft || {};
  const settings = company.commerceSettings || {};

  if (isLanguageRequest(message)) {
    draft._resumeStage = state.stage;
    state.stage = "awaiting_language";
    state.draft = draft;
    conversation.commerceState = state;
    conversation.preferredLanguage = "";
    return addReply(conversation, copy.chooseLanguage, {
      suggestions: LANGUAGE_SUGGESTIONS,
    });
  }

  if (state.stage !== "browsing" && isHelp(message)) {
    const catalog = state.stage === "awaiting_product"
      ? await loadProductCatalog(companyId, language)
      : { products: [] };
    const response = stageResponse(state, copy, language, catalog, settings);
    return addReply(conversation, response.answer, { suggestions: response.suggestions });
  }

  if (state.stage !== "browsing" && isNegative(message)) {
    return addReply(conversation, copy.chooseOrderAction, {
      suggestions: actionSuggestions(language),
    });
  }

  if (state.stage !== "browsing" && isCancel(message)) {
    resetDraft(conversation);
    return addReply(conversation, copy.cancelled);
  }

  if (state.stage !== "browsing" && isBack(message)) {
    state.stage = state.stage === "awaiting_quantity" && draft.variants?.length
      ? "awaiting_variant"
      : previousOrderStage(state.stage);
    state.draft = draft;
    conversation.commerceState = state;
    const catalog = state.stage === "awaiting_product"
      ? await loadProductCatalog(companyId, language)
      : { products: [] };
    const response = stageResponse(state, copy, language, catalog, settings);
    return addReply(conversation, response.answer, { suggestions: response.suggestions });
  }

  if (state.stage !== "browsing" && state.stage !== "awaiting_confirmation" && isChange(message)) {
    resetDraft(conversation, "awaiting_product");
    const catalog = await loadProductCatalog(companyId, language);
    const response = stageResponse(
      conversation.commerceState,
      copy,
      language,
      catalog,
      settings
    );
    return addReply(conversation, response.answer, { suggestions: response.suggestions });
  }

  if (state.stage === "browsing") {
    const catalog = await loadProductCatalog(companyId, language);
    if (isCatalogListIntent(message)) {
      if (!catalog.products.length) return addReply(conversation, copy.noProducts);
      return addReply(conversation, catalogListAnswer(catalog, language), {
        suggestions: productSuggestions(catalog, language),
      });
    }
    const mentionedProduct = resolveCatalogProduct(catalog, message);
    if (mentionedProduct && isCommercialProductIntent(message)) {
      return addReply(conversation, commercialProductAnswer(mentionedProduct, language), {
        media: productMedia(mentionedProduct),
        suggestions: [
          { label: language === "si" ? "වැඩි විස්තර" : language === "ta" ? "மேலும் விவரங்கள்" : "More details", message: `Tell me more about ${mentionedProduct.name}` },
          { label: language === "si" ? "ඇණවුම් කරන්න" : language === "ta" ? "ஆர்டர் செய்" : "Order", message: `Order ${mentionedProduct.name}` },
        ],
      });
    }
    if (!settings.orderingEnabled || !isOrderIntent(message)) {
      await conversation.save();
      return { handled: false, conversation, language, catalogProduct: mentionedProduct || null };
    }
    if (!catalog.products.length) {
      return addReply(conversation, copy.noProducts);
    }
    state.stage = "awaiting_product";
    state.draft = {};
    conversation.commerceState = state;
    if (mentionedProduct) {
      selectProductForOrder(state, mentionedProduct);
      const response = stageResponse(state, copy, language, catalog, settings);
      return addReply(conversation, response.answer, { suggestions: response.suggestions });
    }
    const response = stageResponse(state, copy, language, catalog, settings);
    return addReply(conversation, response.answer, { suggestions: response.suggestions });
  }

  if (state.stage === "awaiting_product") {
    const catalog = await loadProductCatalog(companyId, language);
    const product = resolveCatalogProduct(catalog, message);
    if (!product) {
      const response = stageResponse(state, copy, language, catalog, settings);
      return addReply(conversation, copy.noProductMatch, {
        suggestions: response.suggestions,
      });
    }
    selectProductForOrder(state, product);
    const response = stageResponse(state, copy, language, catalog, settings);
    return addReply(conversation, response.answer, { suggestions: response.suggestions });
  }

  if (state.stage === "awaiting_variant") {
    const variants = draft.variants || [];
    const index = choiceIndex(message, variants.length);
    const variant = index >= 0
      ? variants[index]
      : variants.find((item) => normalize(item.name) === normalize(message));
    if (!variant) {
      const response = stageResponse(state, copy, language, { products: [] }, settings);
      return addReply(conversation, copy.unavailable, { suggestions: response.suggestions });
    }
    draft.variant = variant.name;
    draft.variantId = variant.id || "";
    draft.sku = variant.sku || draft.sku;
    draft.unitPrice = Number(draft.baseUnitPrice || 0) + Number(variant.priceAdjustment || 0);
    delete draft.variants;
    state.stage = "awaiting_quantity";
    state.draft = draft;
    return addReply(conversation, copy.askQuantity, {
      suggestions: actionSuggestions(language),
    });
  }

  if (state.stage === "awaiting_quantity") {
    if (!isValidQuantity(message)) {
      return addReply(conversation, copy.invalidQuantity, {
        suggestions: actionSuggestions(language),
      });
    }
    const quantity = Number(message);
    draft.quantity = quantity;
    if (conversation.customerName) {
      draft.customerName = conversation.customerName;
      if (conversation.customerPhone) {
        draft.customerPhone = conversation.customerPhone;
        state.stage = "awaiting_address";
        state.draft = draft;
        return addReply(conversation, copy.askAddress, {
          suggestions: actionSuggestions(language),
        });
      }
      state.stage = "awaiting_phone";
      state.draft = draft;
      return addReply(conversation, copy.askPhone, {
        suggestions: actionSuggestions(language),
      });
    }
    state.stage = "awaiting_name";
    state.draft = draft;
    return addReply(conversation, copy.askName, {
      suggestions: actionSuggestions(language),
    });
  }

  if (state.stage === "awaiting_name") {
    if (!isPlausibleName(message)) return addReply(conversation, copy.askName, {
      suggestions: actionSuggestions(language),
    });
    draft.customerName = message.slice(0, 120);
    conversation.customerName = draft.customerName;
    if (conversation.customerPhone) {
      draft.customerPhone = conversation.customerPhone;
      state.stage = "awaiting_address";
      state.draft = draft;
      return addReply(conversation, copy.askAddress, {
        suggestions: actionSuggestions(language),
      });
    }
    state.stage = "awaiting_phone";
    state.draft = draft;
    return addReply(conversation, copy.askPhone, {
      suggestions: actionSuggestions(language),
    });
  }

  if (state.stage === "awaiting_phone") {
    if (!isPlausiblePhone(message)) return addReply(conversation, copy.askPhone, {
      suggestions: actionSuggestions(language),
    });
    draft.customerPhone = message;
    conversation.customerPhone = message;
    state.stage = "awaiting_address";
    state.draft = draft;
    return addReply(conversation, copy.askAddress, {
      suggestions: actionSuggestions(language),
    });
  }

  if (state.stage === "awaiting_address") {
    if (!isPlausibleAddress(message)) return addReply(conversation, copy.askAddress, {
      suggestions: actionSuggestions(language),
    });
    draft.deliveryAddress = message.slice(0, 500);
    const methods = settings.paymentMethods?.length
      ? settings.paymentMethods
      : ["Cash on delivery", "Bank transfer"];
    draft.paymentMethods = methods;
    state.stage = "awaiting_payment";
    state.draft = draft;
    return addReply(conversation, copy.askPayment, {
      suggestions: [
        ...methods.map((method) => ({ label: method, message: method })),
        ...actionSuggestions(language),
      ],
    });
  }

  if (state.stage === "awaiting_payment") {
    const methods = draft.paymentMethods || ["Cash on delivery"];
    const index = choiceIndex(message, methods.length);
    const method = index >= 0 ? methods[index] : methods.find((item) => normalize(item) === normalize(message));
    if (!method) return addReply(conversation, copy.askPayment, {
      suggestions: [
        ...methods.map((item) => ({ label: item, message: item })),
        ...actionSuggestions(language),
      ],
    });
    draft.paymentMethod = method;
    delete draft.paymentMethods;
    if (!hasCompleteDraft(draft)) {
      resetDraft(conversation, "awaiting_product");
      return addReply(conversation, copy.restarted);
    }
    state.stage = "awaiting_confirmation";
    state.draft = draft;
    const summary = orderSummary(draft, language, settings);
    return addReply(conversation, copy.confirm.replace("{summary}", summary), {
      suggestions: ["Confirm", "Change", "Cancel"].map((item) => ({ label: item, message: item })),
    });
  }

  if (state.stage === "awaiting_confirmation") {
    if (isChange(message)) {
      resetDraft(conversation, "awaiting_product");
      return addReply(conversation, copy.restarted);
    }
    if (!isConfirm(message)) {
      const summary = orderSummary(draft, language, settings);
      return addReply(conversation, copy.confirm.replace("{summary}", summary), {
        suggestions: ["Confirm", "Change", "Cancel"].map((item) => ({ label: item, message: item })),
      });
    }
    if (!hasCompleteDraft(draft)) {
      resetDraft(conversation, "awaiting_product");
      return addReply(conversation, copy.restarted);
    }
    const refreshed = await refreshDraftProduct(companyId, draft, language);
    if (!refreshed.available) {
      resetDraft(conversation, "awaiting_product");
      const catalog = await loadProductCatalog(companyId, language);
      const response = stageResponse(conversation.commerceState, copy, language, catalog, settings);
      return addReply(conversation, `${copy.unavailable}\n\n${response.answer}`, {
        suggestions: response.suggestions,
      });
    }
    if (refreshed.priceChanged) {
      state.draft = draft;
      conversation.commerceState = state;
      const summary = orderSummary(draft, language, settings);
      return addReply(conversation, `${copy.priceChanged}\n\n${summary}`, {
        suggestions: ["Confirm", "Change", "Cancel"].map((item) => ({ label: item, message: item })),
      });
    }
    const subtotal = Number(draft.unitPrice || 0) * Number(draft.quantity || 0);
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
        productId: draft.productId || null,
        sku: draft.sku || "",
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
      priceStatus: "confirmed",
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
  detectExplicitLanguage,
  isBack,
  isCancel,
  isLanguageRequest,
  isNegative,
  isPlausibleAddress,
  isPlausibleName,
  isPlausiblePhone,
  isValidQuantity,
  localizedText,
  isCatalogListIntent,
  isCommercialProductIntent,
  formatMoney,
  resolveCatalogProduct,
  processCommerceMessage,
};
