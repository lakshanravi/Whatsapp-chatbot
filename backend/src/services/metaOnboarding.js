const crypto = require("crypto");
const axios = require("axios");
const config = require("../config");

function graphVersion() {
  return String(config.graphApiVersion || "v26.0").replace(/^v?/, "v");
}

function graphUrl(path) {
  return `https://graph.facebook.com/${graphVersion()}/${String(path).replace(/^\//, "")}`;
}

function requireMetaApp() {
  if (!config.metaAppId || !config.metaAppSecret) {
    const error = new Error("Meta connection is not configured. Add META_APP_ID and META_APP_SECRET on the server.");
    error.status = 503;
    throw error;
  }
}

function metaError(error, fallback) {
  const detail = error.response?.data?.error?.message || error.message || fallback;
  const wrapped = new Error(detail);
  wrapped.status = error.response?.status || error.status || 502;
  wrapped.meta = error.response?.data?.error || null;
  return wrapped;
}

async function exchangeEmbeddedSignupCode(code) {
  requireMetaApp();
  if (!String(code || "").trim()) {
    const error = new Error("Meta authorization code is required");
    error.status = 400;
    throw error;
  }
  try {
    const response = await axios.get("https://graph.facebook.com/oauth/access_token", {
      params: {
        client_id: config.metaAppId,
        client_secret: config.metaAppSecret,
        code: String(code).trim(),
      },
      timeout: 20000,
    });
    if (!response.data?.access_token) throw new Error("Meta did not return an access token");
    return response.data.access_token;
  } catch (error) {
    throw metaError(error, "Could not complete Meta authorization");
  }
}

async function exchangeLongLivedUserToken(shortLivedToken) {
  requireMetaApp();
  if (!String(shortLivedToken || "").trim()) {
    const error = new Error("Facebook authorization token is required");
    error.status = 400;
    throw error;
  }
  try {
    const response = await axios.get("https://graph.facebook.com/oauth/access_token", {
      params: {
        grant_type: "fb_exchange_token",
        client_id: config.metaAppId,
        client_secret: config.metaAppSecret,
        fb_exchange_token: String(shortLivedToken).trim(),
      },
      timeout: 20000,
    });
    if (!response.data?.access_token) throw new Error("Meta did not return an access token");
    return response.data.access_token;
  } catch (error) {
    throw metaError(error, "Could not complete Facebook authorization");
  }
}

async function getWhatsAppPhone({ accessToken, wabaId, phoneNumberId }) {
  try {
    const [phoneResponse, phonesResponse] = await Promise.all([
      axios.get(graphUrl(phoneNumberId), {
        params: { fields: "id,display_phone_number,verified_name,quality_rating" },
        headers: { Authorization: `Bearer ${accessToken}` },
        timeout: 20000,
      }),
      axios.get(graphUrl(`${wabaId}/phone_numbers`), {
        params: { fields: "id,display_phone_number,verified_name", limit: 100 },
        headers: { Authorization: `Bearer ${accessToken}` },
        timeout: 20000,
      }),
    ]);
    const belongsToWaba = (phonesResponse.data?.data || [])
      .some((phone) => String(phone.id) === String(phoneNumberId));
    if (!belongsToWaba) {
      const error = new Error("The selected phone number does not belong to the selected WhatsApp Business Account");
      error.status = 400;
      throw error;
    }
    return phoneResponse.data;
  } catch (error) {
    throw metaError(error, "Could not validate the selected WhatsApp number");
  }
}

async function subscribeWhatsAppBusinessAccount({ accessToken, wabaId }) {
  try {
    await axios.post(
      graphUrl(`${wabaId}/subscribed_apps`),
      {},
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        timeout: 20000,
      }
    );
  } catch (error) {
    throw metaError(error, "Could not subscribe this WhatsApp account to Pentarix webhooks");
  }
}

async function unsubscribeWhatsAppBusinessAccount({ accessToken, wabaId }) {
  if (!wabaId) return;
  try {
    await axios.delete(graphUrl(`${wabaId}/subscribed_apps`), {
      headers: { Authorization: `Bearer ${accessToken}` },
      timeout: 20000,
    });
  } catch (error) {
    throw metaError(error, "Could not disconnect this WhatsApp account from Pentarix webhooks");
  }
}

async function listFacebookPages(userAccessToken) {
  try {
    const response = await axios.get(graphUrl("me/accounts"), {
      params: { fields: "id,name,access_token,tasks", limit: 100 },
      headers: { Authorization: `Bearer ${userAccessToken}` },
      timeout: 20000,
    });
    return (response.data?.data || []).filter((page) => page.id && page.access_token);
  } catch (error) {
    throw metaError(error, "Could not load Facebook Pages for this account");
  }
}

async function subscribeFacebookPage({ pageId, pageAccessToken }) {
  try {
    await axios.post(
      graphUrl(`${pageId}/subscribed_apps`),
      new URLSearchParams({ subscribed_fields: "messages,messaging_postbacks" }),
      {
        headers: {
          Authorization: `Bearer ${pageAccessToken}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        timeout: 20000,
      }
    );
  } catch (error) {
    throw metaError(error, "Could not subscribe this Facebook Page to Messenger webhooks");
  }
}

async function unsubscribeFacebookPage({ pageId, pageAccessToken }) {
  try {
    await axios.delete(graphUrl(`${pageId}/subscribed_apps`), {
      headers: { Authorization: `Bearer ${pageAccessToken}` },
      timeout: 20000,
    });
  } catch (error) {
    throw metaError(error, "Could not disconnect this Facebook Page from Pentarix webhooks");
  }
}

function connectionId() {
  return crypto.randomBytes(24).toString("hex");
}

module.exports = {
  connectionId,
  exchangeEmbeddedSignupCode,
  exchangeLongLivedUserToken,
  getWhatsAppPhone,
  graphVersion,
  listFacebookPages,
  requireMetaApp,
  subscribeFacebookPage,
  subscribeWhatsAppBusinessAccount,
  unsubscribeFacebookPage,
  unsubscribeWhatsAppBusinessAccount,
};
