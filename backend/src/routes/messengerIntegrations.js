const express = require("express");
const Company = require("../models/Company");
const MessengerIntegration = require("../models/MessengerIntegration");
const { canAccessCompany } = require("../middleware/auth");
const messengerService = require("../modules/messenger/messenger.service");

const router = express.Router({ mergeParams: true });
router.use(canAccessCompany);
const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

function findIntegration(companyId, secret = false) {
  const query = MessengerIntegration.findOne({ companyId });
  if (secret) query.select("+encryptedPageAccessToken +pageAccessTokenIv +pageAccessTokenAuthTag");
  return query;
}

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
  const deleted = await MessengerIntegration.findOneAndDelete({ companyId: req.params.companyId });
  if (!deleted) return res.status(404).json({ error: "Messenger integration not found" });
  return res.json({ message: "Messenger integration deleted" });
}));

module.exports = router;
