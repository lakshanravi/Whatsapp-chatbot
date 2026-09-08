const axios = require("axios");
const config = require("../config");

const REWRITE_TIMEOUT_MS = 15000;
const isDev = process.env.NODE_ENV !== "production";

const SMALL_TALK_INTENTS = new Set(["greeting", "introduction", "thanks", "goodbye"]);

const SYSTEM_PROMPT = `You classify and preprocess customer messages for a support chatbot.

Return JSON only with this exact shape:
{
  "intent": "greeting" | "introduction" | "thanks" | "goodbye" | "support_question",
  "reply": "short friendly reply for greeting/introduction/thanks/goodbye, otherwise null",
  "correctedQuestion": "spelling-corrected question for support_question, otherwise null"
}

Rules:
- Use greeting, introduction, thanks, or goodbye ONLY when the message is purely social with no support question.
- An introduction includes a customer's name, such as "Hi, I am Maya". Greet them by name.
- If the message mixes small talk with a real question (e.g. "hi how do I reset password"), use support_question.
- For support_question, fix spelling and grammar in correctedQuestion while keeping the meaning.
- Preserve whether the message is a question or a factual follow-up. Never turn a fragment such as
  "12V battery, panel clean" into a new how-to question. Do not add a goal, object, symptom, or request
  that the customer did not state.
- reply must be one short friendly sentence for greeting, introduction, thanks, or goodbye.
- Do not answer support questions in reply; only set correctedQuestion.`;

const SOCIAL_STYLE_PROMPT = `Keep social replies warm, natural, and concise. Use conversational
wording and contractions where appropriate. Avoid robotic phrases and do not mention documents
or the knowledge base in a social reply.`;

function logAnalyze(original, result, reason) {
  if (!isDev) return;
  if (reason) {
    console.log(`[queryRewrite] ${reason}: "${original}"`);
  }
}

function parseAnalyzeResponse(content, original) {
  if (!content) {
    return { intent: "support_question", reply: null, correctedQuestion: original };
  }

  try {
    const parsed = JSON.parse(content);
    const intent = SMALL_TALK_INTENTS.has(parsed.intent)
      ? parsed.intent
      : "support_question";

    if (intent !== "support_question") {
      return {
        intent,
        reply: String(parsed.reply || "").trim() || null,
        correctedQuestion: null,
      };
    }

    let correctedQuestion =
      String(parsed.correctedQuestion || "").trim() || original;

    // Short technical statements usually answer an earlier clarification.
    // Grammar cleanup must not turn them into an unrelated question.
    const factualFollowUp = !/[?]/.test(original) && (
      /^(?:i\s+(?:have|use|am|measured|checked)|the\s+(?:battery|panel|controller|inverter|charger)|yes\b|no\b)/i.test(original)
      || /\b\d+(?:\.\d+)?\s*(?:v|a|w|ah|vac|vdc)\b/i.test(original)
    );
    if (factualFollowUp && /[?]/.test(correctedQuestion)) {
      correctedQuestion = original;
    }

    return {
      intent: "support_question",
      reply: null,
      correctedQuestion,
    };
  } catch {
    return { intent: "support_question", reply: null, correctedQuestion: original };
  }
}

async function analyzeUserMessage(message) {
  const original = String(message || "").trim();
  if (!original) {
    return { intent: "support_question", reply: null, correctedQuestion: original };
  }

  if (!config.openaiApiKey) {
    logAnalyze(original, null, "skipped AI analyze (no OPENAI_API_KEY)");
    return { intent: "support_question", reply: null, correctedQuestion: original };
  }

  try {
    const { data } = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: config.openaiChatModel,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: `${SYSTEM_PROMPT}\n\n${SOCIAL_STYLE_PROMPT}` },
          { role: "user", content: original },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${config.openaiApiKey}`,
          "Content-Type": "application/json",
        },
        timeout: REWRITE_TIMEOUT_MS,
      }
    );

    const content = data?.choices?.[0]?.message?.content?.trim();
    return parseAnalyzeResponse(content, original);
  } catch (err) {
    logAnalyze(
      original,
      null,
      `fallback to original (${err.message || "analyze failed"})`
    );
    return { intent: "support_question", reply: null, correctedQuestion: original };
  }
}

async function rewriteUserQuery(message) {
  const analyzed = await analyzeUserMessage(message);
  return analyzed.correctedQuestion || String(message || "").trim();
}

module.exports = { analyzeUserMessage, rewriteUserQuery, parseAnalyzeResponse };
