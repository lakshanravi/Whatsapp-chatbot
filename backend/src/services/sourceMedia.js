const Document = require("../models/Document");
const config = require("../config");

function baseUrl() {
  return String(config.publicBackendUrl || `http://localhost:${config.port}`).replace(/\/$/, "");
}

async function mapSourcesWithMedia(companyId, ragSources = []) {
  const documentIds = [...new Set(ragSources.map((source) => source.document_id).filter(Boolean))];
  const documents = await Document.find({ _id: { $in: documentIds }, companyId }).select("originalName media");
  const byId = new Map(documents.map((document) => [String(document._id), document]));
  const mediaByKey = new Map();

  const sources = ragSources.map((source) => {
    const document = byId.get(String(source.document_id));
    const images = (document?.media || [])
      .filter((item) => Number(item.pageNumber) === Number(source.page_number))
      .slice(0, 3)
      .map((item) => {
        const media = {
          url: `${baseUrl()}/media/${companyId}/${source.document_id}/${encodeURIComponent(item.fileName)}`,
          altText: item.altText || `Image from ${document?.originalName || source.document_name}`,
          documentId: String(source.document_id),
          documentName: document?.originalName || source.document_name,
          pageNumber: item.pageNumber,
          mimeType: item.mimeType,
        };
        mediaByKey.set(media.url, media);
        return media;
      });
    return {
      documentId: source.document_id,
      documentName: source.document_name,
      content: source.content,
      score: source.score,
      pageNumber: source.page_number,
      sectionHeading: source.section_heading || "",
      images,
    };
  });

  return { sources, media: [...mediaByKey.values()].slice(0, 3) };
}

const IMAGE_INTENT = /\b(image|images|photo|photos|picture|pictures|look like|show me|visual)\b/i;
const STOP_WORDS = new Set(["show", "images", "image", "photos", "photo", "pictures", "picture", "some", "with", "have", "what", "does", "like", "look", "please", "give", "about", "that", "this", "also", "variations", "variants"]);

function searchTokens(question) {
  return [...new Set(String(question || "").toLowerCase().match(/[a-z0-9-]{3,}/g) || [])]
    .filter((token) => !STOP_WORDS.has(token));
}

async function findQuestionMedia(companyId, question) {
  if (!IMAGE_INTENT.test(String(question || ""))) return [];
  const tokens = searchTokens(question);
  if (!tokens.length) return [];
  const documents = await Document.find({ companyId, isActive: true, "media.0": { $exists: true } })
    .select("originalName media");
  const candidates = [];
  for (const document of documents) {
    for (const item of document.media || []) {
      const searchable = `${document.originalName} ${item.altText} ${item.contextText}`.toLowerCase();
      const score = tokens.reduce((total, token) => total + (searchable.includes(token) ? 1 : 0), 0);
      if (!score) continue;
      candidates.push({ score, document, item });
    }
  }
  return candidates
    .sort((left, right) => right.score - left.score)
    .slice(0, 3)
    .map(({ document, item }) => ({
      url: `${baseUrl()}/media/${companyId}/${document._id}/${encodeURIComponent(item.fileName)}`,
      altText: item.altText || `Image from ${document.originalName}`,
      documentId: String(document._id),
      documentName: document.originalName,
      pageNumber: item.pageNumber,
      mimeType: item.mimeType,
    }));
}

module.exports = { findQuestionMedia, mapSourcesWithMedia };
