let sdkPromise = null;
let initializedAppId = "";

export function loadMetaSdk({ appId, graphApiVersion = "v26.0" }) {
  if (!appId) return Promise.reject(new Error("Pentarix Meta App ID is not configured"));
  if (window.FB) {
    if (!initializedAppId) {
      window.FB.init({ appId, cookie: true, xfbml: false, version: graphApiVersion });
      initializedAppId = appId;
    }
    return Promise.resolve(window.FB);
  }
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error("Meta connection window could not be loaded")), 15000);
    window.fbAsyncInit = () => {
      window.clearTimeout(timeout);
      window.FB.init({ appId, cookie: true, xfbml: false, version: graphApiVersion });
      initializedAppId = appId;
      resolve(window.FB);
    };
    const existing = document.getElementById("facebook-jssdk");
    if (existing) return;
    const script = document.createElement("script");
    script.id = "facebook-jssdk";
    script.async = true;
    script.defer = true;
    script.crossOrigin = "anonymous";
    script.src = "https://connect.facebook.net/en_US/sdk.js";
    script.onerror = () => {
      window.clearTimeout(timeout);
      sdkPromise = null;
      reject(new Error("Meta connection window could not be loaded"));
    };
    document.head.appendChild(script);
  });
  return sdkPromise;
}

function trustedFacebookOrigin(origin) {
  try {
    const hostname = new URL(origin).hostname.toLowerCase();
    return hostname === "facebook.com" || hostname.endsWith(".facebook.com");
  } catch {
    return false;
  }
}

export async function startWhatsAppEmbeddedSignup({ appId, configId, graphApiVersion }) {
  if (!configId) throw new Error("WhatsApp Embedded Signup configuration ID is missing");
  const FB = await loadMetaSdk({ appId, graphApiVersion });
  return new Promise((resolve, reject) => {
    let authorizationCode = "";
    let sessionInfo = null;
    let finished = false;

    const cleanup = () => {
      window.removeEventListener("message", onMessage);
      window.clearTimeout(timeout);
    };
    const complete = () => {
      if (finished || !authorizationCode || !sessionInfo?.wabaId || !sessionInfo?.phoneNumberId) return;
      finished = true;
      cleanup();
      resolve({ code: authorizationCode, ...sessionInfo });
    };
    const fail = (message) => {
      if (finished) return;
      finished = true;
      cleanup();
      reject(new Error(message));
    };
    const onMessage = (event) => {
      if (!trustedFacebookOrigin(event.origin)) return;
      let payload = event.data;
      try {
        if (typeof payload === "string") payload = JSON.parse(payload);
      } catch {
        return;
      }
      if (payload?.type !== "WA_EMBEDDED_SIGNUP") return;
      const name = String(payload.event || "").toUpperCase();
      if (name === "CANCEL") {
        fail("WhatsApp connection was cancelled before completion");
        return;
      }
      const data = payload.data || {};
      if (data.waba_id && data.phone_number_id) {
        sessionInfo = {
          wabaId: String(data.waba_id),
          phoneNumberId: String(data.phone_number_id),
        };
        complete();
      }
    };
    const timeout = window.setTimeout(
      () => fail("WhatsApp connection timed out. Please start it again."),
      5 * 60 * 1000
    );
    window.addEventListener("message", onMessage);
    FB.login((response) => {
      const code = response?.authResponse?.code;
      if (!code) {
        fail("Meta did not complete WhatsApp authorization");
        return;
      }
      authorizationCode = String(code);
      complete();
    }, {
      config_id: configId,
      response_type: "code",
      override_default_response_type: true,
      extras: { setup: {}, sessionInfoVersion: "3" },
    });
  });
}

export async function startMessengerLogin({ appId, configId, graphApiVersion, permissions = [] }) {
  const FB = await loadMetaSdk({ appId, graphApiVersion });
  return new Promise((resolve, reject) => {
    FB.login((response) => {
      const accessToken = response?.authResponse?.accessToken;
      if (!accessToken) {
        reject(new Error("Facebook Page authorization was cancelled or incomplete"));
        return;
      }
      resolve(String(accessToken));
    }, {
      ...(configId ? { config_id: configId } : {}),
      scope: permissions.join(","),
      return_scopes: true,
      auth_type: "rerequest",
    });
  });
}
