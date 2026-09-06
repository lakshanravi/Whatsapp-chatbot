const axios = require("axios");
const crypto = require("crypto");
const fs = require("fs");
const { pipeline } = require("stream/promises");
const config = require("../config");

const client = axios.create({
  baseURL: config.ragServiceUrl,
  timeout: Number(process.env.RAG_REQUEST_TIMEOUT_MS || 900000),
});

const ingestMaxAttempts = Number(process.env.RAG_INGEST_MAX_ATTEMPTS || 4);
const ingestRetryBaseMs = Number(process.env.RAG_INGEST_RETRY_BASE_MS || 1000);

function isTransientIngestError(error) {
  const status = error.response?.status;
  return !status || status === 408 || status === 429 || status >= 500;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const queryCache = new Map();
const queryCacheTtlMs = Number(process.env.RAG_QUERY_CACHE_TTL_MS || 5 * 60 * 1000);
const queryCacheMaxEntries = Number(process.env.RAG_QUERY_CACHE_MAX_ENTRIES || 250);

function normalizeQuestion(question) {
  return String(question || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizedStrings(values) {
  return [...new Set((values || []).map((value) => String(value || "").trim()).filter(Boolean))];
}

function diagnosticList(value) {
  if (Array.isArray(value)) return normalizedStrings(value);
  return normalizedStrings(String(value || "").split(","));
}

function buildQueryCacheKey({
  companyId,
  question,
  topK,
  history,
  preferredDocumentIds,
  preferredProductNames,
  preferredModelIds,
}) {
  const historyText = (history || []).slice(-16).join("\n").toLowerCase();
  const historyKey = crypto.createHash("sha256").update(historyText).digest("hex");
  return JSON.stringify({
    version: process.env.RAG_QUERY_CACHE_VERSION || "persistent-product-scope-v2",
    companyId,
    question: normalizeQuestion(question),
    topK: topK || null,
    history: historyKey,
    preferredDocumentIds: [...new Set(preferredDocumentIds || [])].sort(),
    preferredProductNames: normalizedStrings(preferredProductNames).sort(),
    preferredModelIds: normalizedStrings(preferredModelIds).sort(),
  });
}

function buildConversationRagContext(messages = [], activeContext = {}) {
  const recent = messages.slice(-16);
  const history = recent.map((item) => `${item.role}: ${item.content}`);
  let preferredDocumentIds = normalizedStrings(activeContext?.documentIds);

  // Use the closest earlier answer that actually cited documents. The RAG
  // service applies this scope only to an incomplete/generic follow-up, so a
  // newly named product can still start a clean topic.
  if (!preferredDocumentIds.length) {
    for (let index = recent.length - 1; index >= 0; index -= 1) {
      const message = recent[index];
      if (message.role !== "assistant" || !message.sources?.length) continue;
      preferredDocumentIds = normalizedStrings(
        message.sources.map((source) => source.documentId)
      );
      break;
    }
  }

  return {
    history,
    preferredDocumentIds,
    preferredProductNames: normalizedStrings(activeContext?.productNames),
    preferredModelIds: normalizedStrings(activeContext?.modelIds),
  };
}

function updateConversationRagContext(conversation, ragResult = {}) {
  const retrieval = ragResult.diagnostics?.retrieval || {};
  const explicitProducts = diagnosticList(retrieval.explicit_product_names);
  const explicitModels = diagnosticList(retrieval.explicit_model_ids);
  const requiredProducts = diagnosticList(retrieval.required_product_names);
  const requiredModels = diagnosticList(retrieval.required_model_ids);
  const sourceDocumentIds = normalizedStrings(
    (ragResult.sources || []).map((source) => source.document_id || source.documentId)
  );
  const current = {
    productNames: normalizedStrings(conversation.ragContext?.productNames),
    modelIds: normalizedStrings(conversation.ragContext?.modelIds),
    documentIds: normalizedStrings(conversation.ragContext?.documentIds),
  };

  // An explicitly named product/model starts a new topic immediately—even if
  // retrieval cannot answer it—so an older product can never leak forward.
  if (explicitProducts.length || explicitModels.length) {
    current.productNames = explicitProducts.length ? explicitProducts : requiredProducts;
    current.modelIds = explicitModels.length ? explicitModels : requiredModels;
    current.documentIds = [];
  } else {
    if (requiredProducts.length) current.productNames = requiredProducts;
    if (requiredModels.length) current.modelIds = requiredModels;
  }

  if (sourceDocumentIds.length) current.documentIds = sourceDocumentIds;
  conversation.ragContext = current;
  return current;
}

function rememberQuery(cacheKey, data, companyId) {
  if (queryCacheTtlMs <= 0 || !data?.answer) return;

  while (queryCache.size >= queryCacheMaxEntries) {
    const oldestKey = queryCache.keys().next().value;
    if (!oldestKey) break;
    queryCache.delete(oldestKey);
  }

  queryCache.set(cacheKey, {
    data,
    companyId: String(companyId),
    expiresAt: Date.now() + queryCacheTtlMs,
  });
}

function invalidateCompanyCache(companyId) {
  const target = String(companyId);
  for (const [key, cached] of queryCache.entries()) {
    if (cached.companyId === target) queryCache.delete(key);
  }
}

async function ingestDocument({
  companyId,
  documentId,
  filePath,
  documentName,
  documentVersion,
  effectiveDate,
  isActive,
}) {
  const payload = {
    company_id: companyId,
    document_id: documentId,
    file_path: filePath,
    document_name: documentName,
    document_version: documentVersion || "1",
    effective_date: effectiveDate || "",
    is_active: isActive !== false,
  };

  let lastError;
  for (let attempt = 1; attempt <= ingestMaxAttempts; attempt += 1) {
    try {
      const { data } = await client.post("/ingest", payload);
      invalidateCompanyCache(companyId);
      return data;
    } catch (error) {
      lastError = error;
      if (!isTransientIngestError(error) || attempt === ingestMaxAttempts) throw error;
      await wait(ingestRetryBaseMs * (2 ** (attempt - 1)));
    }
  }
  throw lastError;
}

async function deleteDocumentVectors({ companyId, documentId }) {
  const { data } = await client.delete("/documents", {
    data: {
      company_id: companyId,
      document_id: documentId,
    },
  });
  invalidateCompanyCache(companyId);
  return data;
}

async function setDocumentActive({ companyId, documentId, isActive }) {
  const { data } = await client.patch("/documents/active", {
    company_id: companyId,
    document_id: documentId,
    is_active: isActive,
  });
  invalidateCompanyCache(companyId);
  return data;
}

async function queryKnowledge({
  companyId,
  question,
  topK,
  history,
  preferredDocumentIds,
  preferredProductNames,
  preferredModelIds,
}) {
  const cacheKey = buildQueryCacheKey({
    companyId,
    question,
    topK,
    history,
    preferredDocumentIds,
    preferredProductNames,
    preferredModelIds,
  });
  const cached = queryCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return {
      ...cached.data,
      diagnostics: {
        ...(cached.data.diagnostics || {}),
        cache: { hit: true, ttlMs: queryCacheTtlMs },
      },
    };
  }

  const { data } = await client.post("/query", {
    company_id: companyId,
    question,
    top_k: topK,
    history: history || [],
    preferred_document_ids: preferredDocumentIds || [],
    preferred_product_names: preferredProductNames || [],
    preferred_model_ids: preferredModelIds || [],
  });

  rememberQuery(cacheKey, data, companyId);

  return data;
}

async function checkHealth() {
  const { data } = await client.get("/health");
  return data;
}

async function downloadIndexBackup(filePath) {
  const response = await client.get("/index-backup", {
    responseType: "stream",
    timeout: 0,
  });
  await pipeline(response.data, fs.createWriteStream(filePath));
}

async function restoreIndexBackup(filePath) {
  const size = fs.statSync(filePath).size;
  await client.post("/index-restore", fs.createReadStream(filePath), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Length": size,
    },
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
    timeout: 0,
  });

  // The RAG process replaces itself after acknowledging the upload so all
  // Chroma file handles reopen against the restored index.
  await wait(1500);
  let lastError;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      await checkHealth();
      return;
    } catch (error) {
      lastError = error;
      await wait(1000);
    }
  }
  throw new Error(`RAG service did not restart after index restore: ${lastError?.message || "unknown error"}`);
}

module.exports = {
  ingestDocument,
  deleteDocumentVectors,
  setDocumentActive,
  queryKnowledge,
  buildConversationRagContext,
  updateConversationRagContext,
  checkHealth,
  downloadIndexBackup,
  restoreIndexBackup,
  invalidateCompanyCache,
};
