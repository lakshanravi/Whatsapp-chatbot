const express = require("express");
const Company = require("../models/Company");
const MessengerIntegration = require("../models/MessengerIntegration");
const MetaConnectionSession = require("../models/MetaConnectionSession");
const { canAccessCompany } = require("../middleware/auth");
const messengerService = require("../modules/messenger/messenger.service");
const config = require("../config");
const metaOnboarding = require("../services/metaOnboarding");

const router = express.Router({ mergeParams: true });
router.use(canAccessCompany);
const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

function findIntegration(companyId, secret = false) {
  const query = MessengerIntegration.findOne({ companyId });
  if (secret) query.select("+encryptedPageAccessToken +pageAccessTokenIv +pageAccessTokenAuthTag");
  return query;
}

router.get("/connect-config", asyncRoute(async (req, res) => {
  if (!(await Company.exists({ _id: req.params.companyId }))) {
    return res.status(404).json({ error: "Company not found" });
  }
  const enabled = Boolean(config.metaAppId && config.metaAppSecret);
  return res.json({
    enabled,
    appId: config.metaAppId || "",
    configId: config.messengerLoginConfigId || "",
    graphApiVersion: metaOnboarding.graphVersion(),
    permissions: ["pages_show_list", "pages_messaging", "pages_manage_metadata"],
    reason: enabled ? "" : "Meta Facebook Login is not configured on the Pentarix server.",
  });
}));

router.post("/connect/pages", async (req, res) => {
  try {
    if (!(await Company.exists({ _id: req.params.companyId }))) {
      return res.status(404).json({ error: "Company not found" });
    }
    const userAccessToken = await metaOnboarding.exchangeLongLivedUserToken(req.body.accessToken);
    const pages = await metaOnboarding.listFacebookPages(userAccessToken);
    if (!pages.length) {
      return res.status(400).json({
        error: "No manageable Facebook Pages were returned. Confirm that you administer a Page and granted all requested permissions.",
      });
    }
    await MetaConnectionSession.deleteMany({
      companyId: req.params.companyId,
      provider: "messenger",
    });
    const session = new MetaConnectionSession({
      connectionId: metaOnboarding.connectionId(),
      companyId: req.params.companyId,
      provider: "messenger",
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });
    session.setToken(userAccessToken);
    await session.save();
    return res.json({
      connectionId: session.connectionId,
      expiresAt: session.expiresAt,
      pages: pages.map((page) => ({ id: String(page.id), name: String(page.name || page.id) })),
    });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message });
  }
});

router.post("/connect", async (req, res) => {
  try {
    const connectionId = String(req.body.connectionId || "").trim();
    const pageId = String(req.body.pageId || "").trim();
    if (!connectionId || !/^\d{5,30}$/.test(pageId)) {
      return res.status(400).json({ error: "A valid Facebook Page selection is required" });
    }
    const session = await MetaConnectionSession.findOne({
      connectionId,
      companyId: req.params.companyId,
      provider: "messenger",
      expiresAt: { $gt: new Date() },
    }).select("+encryptedToken +tokenIv +tokenAuthTag");
    if (!session) {
      return res.status(400).json({ error: "This Facebook connection has expired. Start the connection again." });
    }
    const pages = await metaOnboarding.listFacebookPages(session.getToken());
    const selectedPage = pages.find((page) => String(page.id) === pageId);
    if (!selectedPage) {
      return res.status(403).json({ error: "The selected Facebook Page is not available to this account" });
    }
    const existingPageOwner = await MessengerIntegration.findOne({
      pageId,
      companyId: { $ne: req.params.companyId },
    });
    if (existingPageOwner) {
      return res.status(409).json({ error: "This Facebook Page is already connected to another company" });
    }
    await metaOnboarding.subscribeFacebookPage({
      pageId,
      pageAccessToken: selectedPage.access_token,
    });
    let integration = await findIntegration(req.params.companyId, true);
    const statusCode = integration ? 200 : 201;
    if (!integration) integration = new MessengerIntegration({ companyId: req.params.companyId });
    integration.pageId = pageId;
    integration.pageName = String(selectedPage.name || pageId);
    integration.onboardingMethod = "facebook_login";
    integration.isActive = true;
    integration.setPageAccessToken(selectedPage.access_token);
    await integration.save();
    await session.deleteOne();
    return res.status(statusCode).json(integration.toSafeJSON());
  } catch (error) {
    return res.status(error.status || error.response?.status || 500).json({
      error: error.response?.data?.error?.message || error.message,
    });
  }
});

router.get("/", asyncRoute(async (req, res) => {
  const integration = await findIntegration(req.params.companyId);
  if (!integration) return res.status(404).json({ error: "Messenger integration not found" });
  return res.json(integration.toSafeJSON());
}));

router.post("/validate", async (req, res) => {
  try {
    return res.json(await messengerService.validateIntegration(req.params.companyId));
  } catch (error) {
    return res.status(error.response?.status || 500).json({
      status: "invalid",
      error: error.response?.data?.error?.message || error.message,
    });
  }
});

router.post("/", async (req, res) => {
  try {
    if (!(await Company.exists({ _id: req.params.companyId }))) {
      return res.status(404).json({ error: "Company not found" });
    }
    const pageId = String(req.body.pageId || "").trim();
    const pageAccessToken = String(req.body.pageAccessToken || "").trim();
    if (!pageId || !pageAccessToken) {
      return res.status(400).json({ error: "Page ID and Page access token are required" });
    }
    let integration = await findIntegration(req.params.companyId, true);
    const creating = !integration;
    if (!integration) integration = new MessengerIntegration({ companyId: req.params.companyId });
    integration.pageId = pageId;
    integration.pageName = String(req.body.pageName || integration.pageName || "").trim();
    integration.isActive = req.body.isActive !== false;
    integration.onboardingMethod = "manual";
    integration.setPageAccessToken(pageAccessToken);
    await integration.save();
    return res.status(creating ? 201 : 200).json(integration.toSafeJSON());
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ error: "This Facebook Page is already connected" });
    return res.status(500).json({ error: error.message });
  }
});

router.put("/", async (req, res) => {
  try {
    const integration = await findIntegration(req.params.companyId, true);
    if (!integration) return res.status(404).json({ error: "Messenger integration not found" });
    if (req.body.pageId !== undefined) integration.pageId = String(req.body.pageId).trim();
    if (req.body.pageName !== undefined) integration.pageName = String(req.body.pageName).trim();
    if (typeof req.body.isActive === "boolean") integration.isActive = req.body.isActive;
    if (req.body.pageAccessToken) integration.setPageAccessToken(req.body.pageAccessToken);
    await integration.save();
    return res.json(integration.toSafeJSON());
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ error: "This Facebook Page is already connected" });
    return res.status(500).json({ error: error.message });
  }
});

router.delete("/", asyncRoute(async (req, res) => {
  const integration = await findIntegration(req.params.companyId, true);
  if (!integration) return res.status(404).json({ error: "Messenger integration not found" });
  let warning = "";
  try {
    await metaOnboarding.unsubscribeFacebookPage({
      pageId: integration.pageId,
      pageAccessToken: integration.getPageAccessToken(),
    });
  } catch (error) {
    warning = "The local connection was removed, but Meta could not confirm webhook unsubscription.";
    console.warn("Messenger webhook unsubscribe failed:", error.message);
  }
  await integration.deleteOne();
  return res.json({ message: "Messenger integration deleted", warning });
}));

module.exports = router;
