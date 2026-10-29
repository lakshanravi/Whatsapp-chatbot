const test = require("node:test");
const assert = require("node:assert/strict");

const { parseAnalyzeResponse } = require("../src/services/queryRewrite");

test("does not turn a technical fact follow-up into an unrelated question", () => {
  const result = parseAnalyzeResponse(JSON.stringify({
    intent: "support_question",
    reply: null,
    correctedQuestion: "How do I clean a solar panel for a 12V battery?",
  }), "12V battery, panel clean.");

  assert.equal(result.correctedQuestion, "12V battery, panel clean.");
});

test("allows spelling cleanup when the support request meaning is preserved", () => {
  const result = parseAnalyzeResponse(JSON.stringify({
    intent: "support_question",
    reply: null,
    correctedQuestion: "Why is my controller not charging?",
  }), "Why is my controler not chargeing?");

  assert.equal(result.correctedQuestion, "Why is my controller not charging?");
});

test("preserves an unclear classification instead of inventing an intent", () => {
  const result = parseAnalyzeResponse(JSON.stringify({
    intent: "unclear",
    reply: "I couldn't understand that clearly. Please repeat it.",
    correctedQuestion: null,
  }), "unintelligible transcript");

  assert.equal(result.intent, "unclear");
  assert.match(result.reply, /repeat/i);
});
