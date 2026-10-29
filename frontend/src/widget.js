import { createRealtimeVoice } from "./lib/realtimeVoice";

const DEFAULTS = {
  apiBaseUrl: "https://botbackend.pentarixlabs.com",
  companyId: "",
  title: "Pentarix AI Assistant",
  subtitle: "Ask from our knowledge base",
  accentColor: "#111827",
  headerColor: "",
  headerTextColor: "",
  sendButtonColor: "",
  launcherColor: "",
  launcherIcon: "bot",
  position: "right",
  apiKey: "",
};

function sessionStorageKey(companyId) {
  return `rag_widget_session_${companyId}`;
}

function createSessionId(companyId) {
  const value = `web_${crypto.randomUUID()}`;
  localStorage.setItem(sessionStorageKey(companyId), value);
  return value;
}

function getSessionId(companyId) {
  const key = sessionStorageKey(companyId);
  let value = localStorage.getItem(key);
  if (!value) {
    value = createSessionId(companyId);
  }
  return value;
}

function normalizeColor(value, fallback) {
  if (typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value)) {
    return value;
  }

  return fallback;
}

function launcherIconMarkup(icon) {
  if (icon === "question") {
    return "?";
  }

  if (icon === "message") {
    return `
      <svg class="ragw-launcher-svg" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"></path>
      </svg>
    `;
  }

  return `
    <svg class="ragw-launcher-svg" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 8V4"></path>
      <path d="M8 4h8"></path>
      <rect x="5" y="8" width="14" height="11" rx="3"></rect>
      <path d="M9 13h.01"></path>
      <path d="M15 13h.01"></path>
      <path d="M9 16h6"></path>
    </svg>
  `;
}

function createStyle(config) {
  const style = document.createElement("style");
  const side = config.position === "left" ? "left" : "right";
  const accentColor = normalizeColor(config.accentColor, "#111827");
  const headerColor = normalizeColor(config.headerColor, accentColor);
  const headerTextColor = normalizeColor(config.headerTextColor, "#ffffff");
  const sendButtonColor = normalizeColor(config.sendButtonColor, accentColor);
  const launcherColor = normalizeColor(config.launcherColor, accentColor);
  style.textContent = `
    .ragw-root{position:fixed;${side}:20px;bottom:20px;z-index:2147483000;font-family:Inter,system-ui,-apple-system,Segoe UI,Arial,sans-serif;color:#172033}
    .ragw-button{width:58px;height:58px;border:0;border-radius:999px;background:${launcherColor};color:#fff;box-shadow:0 18px 45px rgba(15,23,42,.28);cursor:pointer;display:flex;align-items:center;justify-content:center;transition:transform .15s ease,filter .15s ease}
    .ragw-button:hover{filter:brightness(.95);transform:translateY(-1px)}
    .ragw-launcher-svg{width:29px;height:29px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
    .ragw-panel{display:none;width:min(380px,calc(100vw - 32px));height:min(620px,calc(100vh - 104px));margin-bottom:14px;border:1px solid #d9e0ea;border-radius:10px;background:#fff;box-shadow:0 24px 70px rgba(15,23,42,.24);overflow:hidden}
    .ragw-open .ragw-panel{display:flex;flex-direction:column}
    .ragw-header{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;background:${headerColor};color:${headerTextColor};padding:14px 16px}
    .ragw-header-copy{min-width:0}
    .ragw-title{font-size:15px;font-weight:800;margin:0}
    .ragw-subtitle{font-size:12px;opacity:.82;margin:3px 0 0}
    .ragw-header-actions{display:flex;align-items:center;gap:4px}.ragw-new-chat,.ragw-close{display:grid;flex:0 0 auto;height:28px;padding:0 8px;border:0;border-radius:999px;background:transparent;color:inherit;line-height:1;cursor:pointer;place-items:center}.ragw-new-chat{font-size:12px}.ragw-close{width:28px;padding:0;font-size:22px}.ragw-new-chat:hover,.ragw-close:hover{background:rgba(127,127,127,.14)}
    .ragw-messages{flex:1;overflow:auto;padding:14px;background:#f6f8fb}
    .ragw-msg{max-width:88%;padding:11px 13px;margin:0 0 12px;border-radius:12px;font-size:14px;line-height:1.55;box-shadow:0 2px 8px rgba(15,23,42,.05)}
    .ragw-user{margin-left:auto;background:${sendButtonColor};color:#fff}
    .ragw-bot{background:#fff;border:1px solid #e1e7ef;color:#172033}
    .ragw-sources{margin-top:8px;border-top:1px solid #e6ebf2;padding-top:7px;font-size:11px;color:#64748b}
    .ragw-media{display:grid;gap:8px;margin:0 0 10px}.ragw-media img{display:block;width:100%;max-height:240px;object-fit:contain;border:1px solid #e1e7ef;border-radius:9px;background:#f8fafc}
    .ragw-suggestions{display:grid;gap:6px;margin-top:10px}.ragw-suggestion{width:100%;border:1px solid #cbd5e1;border-radius:7px;background:#f8fafc;color:#1e293b;padding:8px 9px;text-align:left;font:inherit;font-size:12px;line-height:1.35;cursor:pointer}.ragw-suggestion:hover{border-color:${sendButtonColor};background:#f1f5f9}.ragw-suggestion:disabled{opacity:.55;cursor:not-allowed}
    .ragw-line{min-height:1em;margin:0 0 5px}.ragw-line:last-child{margin-bottom:0}
    .ragw-list{padding-left:18px;margin:6px 0}.ragw-list li{margin:3px 0}
    .ragw-typing{display:flex;gap:4px;align-items:center;width:48px}
    .ragw-dot{width:6px;height:6px;border-radius:50%;background:#94a3b8;animation:ragw-pulse 1.2s infinite}
    .ragw-dot:nth-child(2){animation-delay:.15s}.ragw-dot:nth-child(3){animation-delay:.3s}
    @keyframes ragw-pulse{0%,60%,100%{opacity:.3;transform:translateY(0)}30%{opacity:1;transform:translateY(-3px)}}
    .ragw-form{display:flex;gap:8px;padding:12px;border-top:1px solid #e1e7ef;background:#fff}
    .ragw-input{flex:1;min-width:0;height:40px;border:1px solid #cbd5e1;border-radius:7px;padding:0 10px;font-size:14px;outline:none}
    .ragw-send{height:40px;border:0;border-radius:7px;background:${sendButtonColor};color:#fff;padding:0 14px;font-weight:700;cursor:pointer}
    .ragw-send:disabled{opacity:.55;cursor:not-allowed}
    .ragw-voice-button{display:grid;flex:0 0 40px;width:40px;height:40px;border:1px solid #cbd5e1;border-radius:7px;background:#fff;color:#475569;cursor:pointer;place-items:center}.ragw-voice-button:hover{border-color:${sendButtonColor};color:${sendButtonColor}}.ragw-voice-button.ragw-muted{border-color:#fecdd3;color:#be123c}.ragw-voice-button:disabled{opacity:.45;cursor:not-allowed}.ragw-voice-button svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
    .ragw-voice-status{display:flex;align-items:center;gap:8px;padding:8px 12px;border-top:1px solid #d1fae5;background:#ecfdf5;color:#065f46;font-size:12px}.ragw-voice-status[hidden],.ragw-voice-button[hidden]{display:none!important}.ragw-voice-dot{width:7px;height:7px;border-radius:50%;background:#10b981}.ragw-voice-dot.ragw-live{animation:ragw-pulse 1.2s infinite}.ragw-voice-copy{min-width:0;flex:1}.ragw-voice-label{font-weight:700}.ragw-voice-transcript{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;opacity:.86}.ragw-voice-end{border:0;background:transparent;color:#065f46;font:inherit;font-weight:700;cursor:pointer}
  `;
  document.head.appendChild(style);
}

function appendFormattedText(container, text) {
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;
  for (const part of text.split(pattern).filter(Boolean)) {
    if (part.startsWith("**") && part.endsWith("**")) {
      const strong = document.createElement("strong");
      strong.textContent = part.slice(2, -2);
      container.appendChild(strong);
    } else if (part.startsWith("*") && part.endsWith("*")) {
      const em = document.createElement("em");
      em.textContent = part.slice(1, -1);
      container.appendChild(em);
    } else {
      container.appendChild(document.createTextNode(part));
    }
  }
}

function appendFormattedAnswer(node, text) {
  let list = null;
  for (const rawLine of String(text || "").split("\n")) {
    const match = rawLine.match(/^\s*[-*]\s+(.+)/);
    if (match) {
      if (!list) {
        list = document.createElement("ul");
        list.className = "ragw-list";
        node.appendChild(list);
      }
      const item = document.createElement("li");
      appendFormattedText(item, match[1]);
      list.appendChild(item);
      continue;
    }
    list = null;
    const line = document.createElement("div");
    line.className = "ragw-line";
    appendFormattedText(line, rawLine);
    node.appendChild(line);
  }
}

function messageNode(role, text, sources = [], feedbackOptions = null, suggestions = [], media = []) {
  const node = document.createElement("div");
  node.className = `ragw-msg ${role === "user" ? "ragw-user" : "ragw-bot"}`;
  if (role !== "user" && media.length) {
    const gallery = document.createElement("div");
    gallery.className = "ragw-media";
    for (const item of media) {
      const image = document.createElement("img");
      image.src = item.url;
      image.alt = item.altText || "Supporting document image";
      image.loading = "lazy";
      gallery.appendChild(image);
    }
    node.appendChild(gallery);
  }
  appendFormattedAnswer(node, text);
  if (sources.length) {
    const sourceBox = document.createElement("div");
    sourceBox.className = "ragw-sources";
    const sourceLabels = [...new Set(sources.map((source) => {
      if (!source.documentName) return "";
      return source.pageNumber
        ? `${source.documentName} (page ${source.pageNumber})`
        : source.documentName;
    }).filter(Boolean))];
    sourceBox.textContent = `Sources: ${sourceLabels.join(", ")}`;
    node.appendChild(sourceBox);
  }
  if (role !== "user" && suggestions.length) {
    const choices = document.createElement("div");
    choices.className = "ragw-suggestions";
    for (const suggestion of suggestions) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "ragw-suggestion";
      button.textContent = suggestion.label;
      button.addEventListener("click", () => {
        choices.querySelectorAll("button").forEach((item) => { item.disabled = true; });
        feedbackOptions?.onSuggestion?.(suggestion.message, suggestion.label);
      });
      choices.appendChild(button);
    }
    node.appendChild(choices);
  }
  return node;
}

function typingNode() {
  const node = document.createElement("div");
  node.className = "ragw-msg ragw-bot ragw-typing";
  node.setAttribute("aria-label", "Assistant is typing");
  node.innerHTML = '<span class="ragw-dot"></span><span class="ragw-dot"></span><span class="ragw-dot"></span>';
  return node;
}

function friendlyChatError(status, data, cause) {
  const detail = String(data?.detail || data?.error || cause?.message || "").toLowerCase();
  if (!status || detail.includes("failed to fetch") || detail.includes("networkerror")) {
    return "I can't connect to the support service right now. Please check your connection and try again.";
  }
  if (status === 401 || status === 403) {
    return "This assistant is not available on this website right now. Please contact the business directly.";
  }
  if (status === 429) return "I'm receiving many requests right now. Please wait a moment and try again.";
  if (status === 502 || status === 503 || status === 504 || status >= 500) {
    return "I couldn't complete that request right now. Please try again in a moment.";
  }
  return "I couldn't send your message. Please check it and try again.";
}

async function sendMessage(config, message, sessionId, { isSuggestion = false } = {}) {
  let response;
  try {
    response = await fetch(`${config.apiBaseUrl}/widget/companies/${config.companyId}/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Widget-API-Key": config.apiKey,
      },
      body: JSON.stringify({
        message,
        sessionId,
        customerName: config.customerName || "",
        customerEmail: config.customerEmail || "",
        customerPhone: config.customerPhone || "",
        isSuggestion,
      }),
    });
  } catch (cause) {
    throw new Error(friendlyChatError(0, null, cause));
  }
  const data = await response.json();
  if (!response.ok) throw new Error(friendlyChatError(response.status, data));
  return data;
}

async function loadHistory(config, sessionId) {
  const response = await fetch(
    `${config.apiBaseUrl}/widget/companies/${config.companyId}/chat/history/${encodeURIComponent(sessionId)}`,
    {
      headers: {
        "X-Widget-API-Key": config.apiKey,
      },
    }
  );
  const data = await response.json();
  if (!response.ok) throw new Error(friendlyChatError(response.status, data));
  return data;
}

async function createVoiceSession(config, sessionId) {
  let response;
  try {
    response = await fetch(
      `${config.apiBaseUrl}/widget/companies/${config.companyId}/chat/realtime/session`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Widget-API-Key": config.apiKey,
        },
        body: JSON.stringify({ sessionId }),
      }
    );
  } catch (cause) {
    throw new Error(friendlyChatError(0, null, cause));
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Voice is temporarily unavailable. Please try again.");
  }
  return data;
}

function initWidget(options = {}) {
  const config = { ...DEFAULTS, ...window.RAG_CHAT_WIDGET, ...options };
  if (!config.companyId) {
    console.error("[RAG Widget] companyId is required");
    return;
  }

  createStyle(config);
  let sessionId = getSessionId(config.companyId);
  const root = document.createElement("div");
  root.className = "ragw-root";
  root.innerHTML = `
    <section class="ragw-panel">
      <header class="ragw-header">
        <div class="ragw-header-copy">
          <p class="ragw-title"></p>
          <p class="ragw-subtitle"></p>
        </div>
        <div class="ragw-header-actions">
          <button class="ragw-new-chat" type="button" aria-label="Start a new chat">New chat</button>
          <button class="ragw-close" type="button" aria-label="Close chat">&times;</button>
        </div>
      </header>
      <div class="ragw-messages"></div>
      <div class="ragw-voice-status" hidden>
        <span class="ragw-voice-dot"></span>
        <div class="ragw-voice-copy">
          <div class="ragw-voice-label">Listening</div>
          <div class="ragw-voice-transcript"></div>
        </div>
        <button class="ragw-voice-end" type="button">End</button>
      </div>
      <form class="ragw-form">
        <input class="ragw-input" type="text" placeholder="Type your question" autocomplete="off" />
        <button class="ragw-voice-button ragw-voice-start" type="button" aria-label="Start voice conversation" title="Start voice conversation">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><path d="M12 19v3"></path></svg>
        </button>
        <button class="ragw-voice-button ragw-voice-mute" type="button" aria-label="Mute microphone" title="Mute microphone" hidden>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><path d="M12 19v3"></path></svg>
        </button>
        <button class="ragw-voice-button ragw-voice-stop" type="button" aria-label="Stop assistant speaking" title="Stop speaking" hidden>
          <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="1"></rect></svg>
        </button>
        <button class="ragw-send" type="submit">Send</button>
      </form>
    </section>
    <button class="ragw-button" type="button" aria-label="Open chat">${launcherIconMarkup(config.launcherIcon)}</button>
  `;

  root.querySelector(".ragw-title").textContent = config.title;
  root.querySelector(".ragw-subtitle").textContent = config.subtitle;
  const messages = root.querySelector(".ragw-messages");
  const input = root.querySelector(".ragw-input");
  const form = root.querySelector(".ragw-form");
  const send = root.querySelector(".ragw-send");
  const toggle = root.querySelector(".ragw-button");
  const newChat = root.querySelector(".ragw-new-chat");
  const close = root.querySelector(".ragw-close");
  const voiceStatus = root.querySelector(".ragw-voice-status");
  const voiceDot = root.querySelector(".ragw-voice-dot");
  const voiceLabel = root.querySelector(".ragw-voice-label");
  const voiceTranscript = root.querySelector(".ragw-voice-transcript");
  const voiceStart = root.querySelector(".ragw-voice-start");
  const voiceMute = root.querySelector(".ragw-voice-mute");
  const voiceStop = root.querySelector(".ragw-voice-stop");
  const voiceEnd = root.querySelector(".ragw-voice-end");
  let historyReady = false;
  let voiceController = null;
  let voiceState = "idle";
  let voiceMuted = false;
  let voiceQueue = Promise.resolve();
  let voiceAttempt = 0;
  let voiceLanguage = "";
  input.disabled = true;
  send.disabled = true;

  function updateVoiceUi(state) {
    voiceState = state;
    const active = state !== "idle" && state !== "disconnected";
    const labels = {
      connecting: "Connecting voice…",
      listening: "Listening",
      thinking: "Finding an answer…",
      speaking: "Speaking",
      muted: "Microphone muted",
      disconnected: "Voice disconnected",
    };
    voiceStatus.hidden = !active;
    voiceStart.hidden = active;
    voiceMute.hidden = !active;
    voiceStop.hidden = state !== "speaking";
    voiceDot.classList.toggle("ragw-live", state === "listening");
    voiceLabel.textContent = labels[state] || "Voice active";
  }

  function stopVoice() {
    voiceAttempt += 1;
    voiceController?.close();
    voiceController = null;
    voiceQueue = Promise.resolve();
    voiceMuted = false;
    voiceTranscript.textContent = "";
    voiceMute.setAttribute("aria-label", "Mute microphone");
    voiceMute.title = "Mute microphone";
    voiceMute.classList.remove("ragw-muted");
    updateVoiceUi("idle");
  }

  async function startVoice() {
    if (voiceController || voiceState === "connecting" || !historyReady) return;
    voiceTranscript.textContent = "";
    const attempt = ++voiceAttempt;
    try {
      const controller = await createRealtimeVoice({
        getSessionToken: () => createVoiceSession(config, sessionId),
        onStateChange: updateVoiceUi,
        onInputTranscriptDelta: (delta) => {
          voiceTranscript.textContent += delta;
        },
        onInputTranscript: (transcript) => {
          voiceTranscript.textContent = transcript;
          updateVoiceUi("thinking");
          voiceQueue = voiceQueue.then(async () => {
            const result = await submitMessage(transcript, transcript);
            if (!result?.answer && voiceController) {
              updateVoiceUi(voiceMuted ? "muted" : "listening");
            }
          });
        },
        onOutputTranscriptDelta: (delta) => {
          voiceTranscript.textContent += delta;
        },
        onUnclearTranscript: () => {
          const warning = {
            si: "මට එය පැහැදිලිව හඳුනාගත නොහැකි විය. කරුණාකර නැවත කියන්න.",
            ta: "அதைத் தெளிவாகப் புரிந்துகொள்ள முடியவில்லை. மீண்டும் சொல்லுங்கள்.",
            en: "I couldn't recognize that clearly. Please say it again.",
          }[voiceLanguage] || "I couldn't recognize that language clearly. Please choose English, Sinhala, or Tamil and try again.";
          voiceTranscript.textContent = warning;
          messages.appendChild(messageNode("bot", warning));
          messages.scrollTop = messages.scrollHeight;
          updateVoiceUi("listening");
          voiceController?.speak(warning);
        },
        onError: (error) => {
          console.warn("[RAG Widget] Realtime voice error", error);
          voiceTranscript.textContent = error.message || "Voice encountered an error.";
        },
      });
      if (attempt !== voiceAttempt) {
        controller.close();
        return;
      }
      voiceController = controller;
      if (voiceLanguage) controller.setInputLanguage(voiceLanguage);
      voiceMuted = false;
    } catch (error) {
      if (attempt !== voiceAttempt) return;
      stopVoice();
      messages.appendChild(messageNode(
        "bot",
        error.message || "Voice is temporarily unavailable. Please type your message instead."
      ));
      messages.scrollTop = messages.scrollHeight;
    }
  }

  async function submitMessage(text, displayText = text, { isSuggestion = false } = {}) {
    if (!text || !historyReady) return null;
    input.value = "";
    messages.appendChild(messageNode("user", displayText));
    messages.scrollTop = messages.scrollHeight;
    send.disabled = true;
    const typing = typingNode();
    messages.appendChild(typing);
    messages.scrollTop = messages.scrollHeight;
    const requestSessionId = sessionId;
    try {
      const result = await sendMessage(config, text, requestSessionId, { isSuggestion });
      if (sessionId !== requestSessionId) return;
      typing.remove();
      messages.appendChild(messageNode(
        "bot",
        result.answer,
        result.sources || [],
        {
          onSuggestion: (message, label) => submitMessage(
            message,
            label,
            { isSuggestion: true }
          ),
        },
        result.suggestions || [],
        result.media || []
      ));
      if (result.language) voiceLanguage = result.language;
      if (voiceController && result.answer) {
        if (result.language) voiceController.setInputLanguage(result.language);
        voiceTranscript.textContent = "";
        voiceController.speak(result.answer);
      }
      return result;
    } catch (error) {
      if (sessionId !== requestSessionId) return;
      typing.remove();
      messages.appendChild(messageNode("bot", error.message || "Unable to send message."));
      return null;
    } finally {
      send.disabled = false;
      messages.scrollTop = messages.scrollHeight;
    }
  }

  toggle.addEventListener("click", () => {
    const willOpen = !root.classList.contains("ragw-open");
    root.classList.toggle("ragw-open");
    if (!willOpen) stopVoice();
  });
  newChat.addEventListener("click", () => {
    stopVoice();
    sessionId = createSessionId(config.companyId);
    voiceLanguage = "";
    messages.replaceChildren(messageNode("bot", config.greeting || "Hi, how can I help?"));
    input.value = "";
    input.focus();
  });
  close.addEventListener("click", () => {
    stopVoice();
    root.classList.remove("ragw-open");
  });
  voiceStart.addEventListener("click", startVoice);
  voiceMute.addEventListener("click", () => {
    if (!voiceController) return;
    voiceMuted = voiceController.setMuted(!voiceController.isMuted());
    voiceMute.classList.toggle("ragw-muted", voiceMuted);
    voiceMute.setAttribute("aria-label", voiceMuted ? "Unmute microphone" : "Mute microphone");
    voiceMute.title = voiceMuted ? "Unmute microphone" : "Mute microphone";
  });
  voiceStop.addEventListener("click", () => voiceController?.stopSpeaking());
  voiceEnd.addEventListener("click", stopVoice);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    await submitMessage(input.value.trim());
  });

  document.body.appendChild(root);

  async function restoreConversation() {
    const loading = typingNode();
    messages.appendChild(loading);
    try {
      const history = await loadHistory(config, sessionId);
      loading.remove();
      const savedMessages = Array.isArray(history.messages) ? history.messages : [];
      voiceLanguage = history.preferredLanguage || "";
      if (!savedMessages.length) {
        messages.appendChild(messageNode("bot", config.greeting || "Hi, how can I help?"));
        return;
      }

      for (const savedMessage of savedMessages) {
        messages.appendChild(messageNode(
          savedMessage.role,
          savedMessage.content,
          savedMessage.sources || [],
          null,
          [],
          savedMessage.media || []
        ));
      }
    } catch (error) {
      loading.remove();
      console.warn("[RAG Widget] Unable to restore chat history", error);
      messages.appendChild(messageNode(
        "bot",
        "I couldn't load your earlier messages, but you can start a new chat here."
      ));
    } finally {
      historyReady = true;
      input.disabled = false;
      send.disabled = false;
      messages.scrollTop = messages.scrollHeight;
    }
  }

  restoreConversation();
}

window.RAGChatWidget = { init: initWidget };

if (window.RAG_CHAT_WIDGET?.autoInit !== false) {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => initWidget());
  } else {
    initWidget();
  }
}
