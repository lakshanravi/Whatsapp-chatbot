const OPENAI_REALTIME_CALLS_URL = "https://api.openai.com/v1/realtime/calls";

function hasUnsupportedLanguageScript(value) {
  const letters = [...String(value || "")].filter((character) => /\p{L}/u.test(character));
  return letters.length > 0 && letters.some((character) => (
    !/\p{Script=Latin}|\p{Script=Sinhala}|\p{Script=Tamil}/u.test(character)
  ));
}

function waitForIceGathering(peerConnection) {
  if (peerConnection.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve) => {
    const timeout = window.setTimeout(resolve, 3000);
    const handleChange = () => {
      if (peerConnection.iceGatheringState !== "complete") return;
      window.clearTimeout(timeout);
      peerConnection.removeEventListener("icegatheringstatechange", handleChange);
      resolve();
    };
    peerConnection.addEventListener("icegatheringstatechange", handleChange);
  });
}

export async function createRealtimeVoice({
  getSessionToken,
  onStateChange = () => {},
  onInputTranscript = () => {},
  onInputTranscriptDelta = () => {},
  onOutputTranscriptDelta = () => {},
  onUnclearTranscript = () => {},
  onError = () => {},
}) {
  if (!navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection) {
    throw new Error("Realtime voice is not supported by this browser.");
  }

  onStateChange("connecting");
  const token = await getSessionToken();
  if (!token?.value) throw new Error("The voice session could not be created.");

  const peerConnection = new RTCPeerConnection();
  const remoteAudio = document.createElement("audio");
  remoteAudio.autoplay = true;
  remoteAudio.setAttribute("playsinline", "");
  const mediaStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });
  const microphoneTrack = mediaStream.getAudioTracks()[0];
  peerConnection.addTrack(microphoneTrack, mediaStream);
  peerConnection.ontrack = (event) => {
    remoteAudio.srcObject = event.streams[0];
    remoteAudio.play().catch(() => {});
  };

  const dataChannel = peerConnection.createDataChannel("oai-events");
  const completedInputItems = new Set();
  let closed = false;
  let muted = false;
  let activeResponse = false;
  let inputLanguage = "";

  function send(event) {
    if (dataChannel.readyState !== "open") return false;
    dataChannel.send(JSON.stringify(event));
    return true;
  }

  function cancelResponse() {
    if (activeResponse) send({ type: "response.cancel" });
    activeResponse = false;
    remoteAudio.pause();
    onStateChange(muted ? "muted" : "listening");
  }

  dataChannel.addEventListener("open", () => {
    onStateChange(muted ? "muted" : "listening");
  });
  dataChannel.addEventListener("close", () => {
    if (!closed) onStateChange("disconnected");
  });
  dataChannel.addEventListener("message", (message) => {
    let event;
    try {
      event = JSON.parse(message.data);
    } catch {
      return;
    }

    if (event.type === "input_audio_buffer.speech_started") {
      if (activeResponse) cancelResponse();
      onStateChange("listening");
      return;
    }
    if (event.type === "conversation.item.input_audio_transcription.delta") {
      onInputTranscriptDelta(event.delta || "");
      return;
    }
    if (event.type === "conversation.item.input_audio_transcription.completed") {
      if (completedInputItems.has(event.item_id)) return;
      completedInputItems.add(event.item_id);
      const transcript = String(event.transcript || "").trim();
      if (transcript && hasUnsupportedLanguageScript(transcript)) {
        onUnclearTranscript(transcript);
        return;
      }
      if (transcript) onInputTranscript(transcript);
      return;
    }
    if (event.type === "response.created") {
      activeResponse = true;
      remoteAudio.play().catch(() => {});
      onStateChange("speaking");
      return;
    }
    if (event.type === "response.output_audio_transcript.delta") {
      onOutputTranscriptDelta(event.delta || "");
      return;
    }
    if (event.type === "response.done") {
      activeResponse = false;
      onStateChange(muted ? "muted" : "listening");
      return;
    }
    if (
      event.type === "conversation.item.input_audio_transcription.failed"
      || event.type === "error"
    ) {
      onError(new Error(
        event.error?.message || "The realtime voice session encountered an error."
      ));
    }
  });

  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);
  await waitForIceGathering(peerConnection);
  const sdpResponse = await fetch(OPENAI_REALTIME_CALLS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token.value}`,
      "Content-Type": "application/sdp",
    },
    body: peerConnection.localDescription?.sdp || offer.sdp,
  });
  if (!sdpResponse.ok) {
    const detail = await sdpResponse.text().catch(() => "");
    mediaStream.getTracks().forEach((track) => track.stop());
    peerConnection.close();
    throw new Error(detail || "The realtime voice connection could not be established.");
  }
  await peerConnection.setRemoteDescription({
    type: "answer",
    sdp: await sdpResponse.text(),
  });

  return {
    speak(text) {
      const answer = String(text || "").trim();
      if (!answer) return false;
      remoteAudio.play().catch(() => {});
      return send({
        type: "response.create",
        response: {
          conversation: "none",
          metadata: { source: "pentarix-rag" },
          input: [],
          output_modalities: ["audio"],
          instructions: (
            "Speak exactly the customer-facing answer below. Do not add, remove, "
            + "summarize, answer independently, or read source labels and URLs aloud. "
            + "Use a natural helpful tone.\n\n"
            + answer
          ),
        },
      });
    },
    setMuted(value) {
      muted = Boolean(value);
      microphoneTrack.enabled = !muted;
      onStateChange(activeResponse ? "speaking" : (muted ? "muted" : "listening"));
      return muted;
    },
    isMuted() {
      return muted;
    },
    setInputLanguage(language) {
      const nextLanguage = ["en", "si", "ta"].includes(language) ? language : "";
      if (!nextLanguage || nextLanguage === inputLanguage) return false;
      inputLanguage = nextLanguage;
      const usesLanguageList = ["gpt-transcribe", "gpt-live-transcribe"].includes(
        token.transcriptionModel
      );
      const prompts = {
        en: "The customer is speaking English. Preserve product names and SKUs exactly.",
        si: "The customer is speaking Sinhala (සිංහල). Expect natural Sri Lankan Sinhala speech. Preserve English product names and SKUs exactly.",
        ta: "The customer is speaking Tamil (தமிழ்). Preserve English product names and SKUs exactly.",
      };
      return send({
        type: "session.update",
        session: {
          type: "realtime",
          audio: {
            input: {
              transcription: usesLanguageList
                ? {
                    languages: nextLanguage === "si" ? [] : [nextLanguage],
                    prompt: prompts[nextLanguage],
                  }
                : {
                    language: nextLanguage === "si" ? null : nextLanguage,
                    prompt: prompts[nextLanguage],
                  },
            },
          },
        },
      });
    },
    stopSpeaking: cancelResponse,
    close() {
      closed = true;
      cancelResponse();
      dataChannel.close();
      mediaStream.getTracks().forEach((track) => track.stop());
      remoteAudio.pause();
      remoteAudio.srcObject = null;
      peerConnection.close();
      onStateChange("idle");
    },
  };
}
