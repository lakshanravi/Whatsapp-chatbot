const express = require("express");

const Company = require("../models/Company");
const WhatsAppIntegration = require("../models/WhatsAppIntegration");
const whatsappService = require("../modules/whatsapp/whatsapp.service");
const config = require("../config");
const metaOnboarding = require("../services/metaOnboarding");

const router = express.Router({ mergeParams: true });

async function ensureCompany(companyId) {
  const company = await Company.findById(companyId);
  if (!company) {
    const err = new Error("Company not found");
    err.status = 404;
    throw err;
  }
  return company;
}

async function findIntegration(companyId, includeSecret = false) {
  const query = WhatsAppIntegration.findOne({ companyId });
  if (includeSecret) {
    query.select("+encryptedAccessToken +accessTokenIv +accessTokenAuthTag");
  }
  return query;
}

function getWhatsAppPayload(body) {
  return {
    accessToken: body.accessToken || body.WHATSAPP_ACCESS_TOKEN,
    phoneNumberId: body.phoneNumberId || body.WHATSAPP_PHONE_NUMBER_ID,
    isActive: body.isActive,
  };
}

function cleanMetaId(value, label) {
  const id = String(value || "").trim();
  if (!/^\d{5,30}$/.test(id)) {
    const error = new Error(`${label} is invalid`);
    error.status = 400;
    throw error;
  }
  return id;
}

router.get("/connect-config", async (req, res) => {
  try {
    await ensureCompany(req.params.companyId);
    const enabled = Boolean(
      config.metaAppId
      && config.metaAppSecret
      && config.whatsappEmbeddedSignupConfigId
    );
    return res.json({
      enabled,
      appId: config.metaAppId || "",
      configId: config.whatsappEmbeddedSignupConfigId || "",
      graphApiVersion: metaOnboarding.graphVersion(),
      reason: enabled
        ? ""
        : "Meta Embedded Signup is not configured on the Pentarix server.",
    });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message });
  }
});

router.post("/connect", async (req, res) => {
  try {
    await ensureCompany(req.params.companyId);
    if (!config.whatsappEmbeddedSignupConfigId) {
      return res.status(503).json({
        error: "WhatsApp Embedded Signup is not configured on the Pentarix server",
      });
    }
    const wabaId = cleanMetaId(req.body.wabaId, "WhatsApp Business Account ID");
    const phoneNumberId = cleanMetaId(req.body.phoneNumberId, "WhatsApp phone number ID");
    const existingPhoneOwner = await WhatsAppIntegration.findOne({
      phoneNumberId,
      companyId: { $ne: req.params.companyId },
    });
    if (existingPhoneOwner) {
      return res.status(409).json({ error: "This WhatsApp number is already connected to another company" });
    }

    const accessToken = await metaOnboarding.exchangeEmbeddedSignupCode(req.body.code);
    const phone = await metaOnboarding.getWhatsAppPhone({ accessToken, wabaId, phoneNumberId });
    await metaOnboarding.subscribeWhatsAppBusinessAccount({ accessToken, wabaId });

    let integration = await findIntegration(req.params.companyId, true);
    const statusCode = integration ? 200 : 201;
    if (!integration) integration = new WhatsAppIntegration({ companyId: req.params.companyId });
    integration.phoneNumberId = phoneNumberId;
    integration.wabaId = wabaId;
    integration.displayPhoneNumber = String(phone.display_phone_number || "");
    integration.verifiedName = String(phone.verified_name || "");
    integration.onboardingMethod = "embedded_signup";
    integration.isActive = true;
    integration.setAccessToken(accessToken);
    await integration.save();
    return res.status(statusCode).json(integration.toSafeJSON());
  } catch (error) {
    return res.status(error.status || 500).json({
      error: error.message,
      type: error.meta?.type,
      code: error.meta?.code,
      errorSubcode: error.meta?.error_subcode,
    });
  }
});

router.post("/", async (req, res) => {
  try {
    await ensureCompany(req.params.companyId);

    const { accessToken, phoneNumberId, isActive } = getWhatsAppPayload(req.body);
    if (!accessToken || !String(accessToken).trim()) {
      return res.status(400).json({ error: "WhatsApp access token is required" });
    }
    if (!phoneNumberId || !String(phoneNumberId).trim()) {
      return res.status(400).json({ error: "WhatsApp phone number ID is required" });
    }

    const existingPhoneOwner = await WhatsAppIntegration.findOne({
      phoneNumberId: String(phoneNumberId).trim(),
      companyId: { $ne: req.params.companyId },
    });
    if (existingPhoneOwner) {
      return res
        .status(409)
        .json({ error: "WhatsApp phone number ID is already configured" });
    }

    let integration = await findIntegration(req.params.companyId, true);
    const statusCode = integration ? 200 : 201;

    if (!integration) {
      integration = new WhatsAppIntegration({ companyId: req.params.companyId });
    }

    integration.phoneNumberId = String(phoneNumberId).trim();
    integration.onboardingMethod = "manual";
    integration.isActive = typeof isActive === "boolean" ? isActive : integration.isActive;
    integration.setAccessToken(accessToken);
    await integration.save();

    res.status(statusCode).json(integration.toSafeJSON());
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.get("/", async (req, res) => {
  try {
    await ensureCompany(req.params.companyId);

    const integration = await findIntegration(req.params.companyId);
    if (!integration) {
      return res.status(404).json({ error: "WhatsApp integration not found" });
    }

    res.json(integration.toSafeJSON());
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.post("/validate", async (req, res) => {
  try {
    await ensureCompany(req.params.companyId);

    const result = await whatsappService.validateIntegration({
      companyId: req.params.companyId,
    });

    res.json(result);
  } catch (err) {
    const status = err.response?.status || err.status || 500;
    const metaError = err.response?.data?.error;
    const detail = metaError?.message || err.message;

    res.status(status).json({
      status: "invalid",
      error: detail,
      companyId: err.whatsappContext?.companyId,
      phoneNumberId: err.whatsappContext?.phoneNumberId,
      accessTokenLast4: err.whatsappContext?.accessTokenLast4,
      type: metaError?.type,
      code: metaError?.code,
      errorSubcode: metaError?.error_subcode,
      fbtraceId: metaError?.fbtrace_id,
    });
  }
});

router.put("/", async (req, res) => {
  try {
    await ensureCompany(req.params.companyId);

    const integration = await findIntegration(req.params.companyId, true);
    if (!integration) {
      return res.status(404).json({ error: "WhatsApp integration not found" });
    }

    const { accessToken, phoneNumberId, isActive } = getWhatsAppPayload(req.body);
    if (
      !accessToken &&
      !phoneNumberId &&
      typeof isActive !== "boolean"
    ) {
      return res.status(400).json({
        error:
          "At least one of accessToken, WHATSAPP_ACCESS_TOKEN, phoneNumberId, WHATSAPP_PHONE_NUMBER_ID, or isActive is required",
      });
    }

    if (phoneNumberId && String(phoneNumberId).trim() !== integration.phoneNumberId) {
      const existingPhoneOwner = await WhatsAppIntegration.findOne({
        phoneNumberId: String(phoneNumberId).trim(),
        companyId: { $ne: req.params.companyId },
      });
      if (existingPhoneOwner) {
        return res
          .status(409)
          .json({ error: "WhatsApp phone number ID is already configured" });
      }
      integration.phoneNumberId = String(phoneNumberId).trim();
    }

    if (typeof isActive === "boolean") {
      integration.isActive = isActive;
    }

    if (accessToken) {
      integration.setAccessToken(accessToken);
    }

    await integration.save();
    res.json(integration.toSafeJSON());
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.delete("/", async (req, res) => {
  try {
    await ensureCompany(req.params.companyId);

    const integration = await findIntegration(req.params.companyId, true);
    if (!integration) {
      return res.status(404).json({ error: "WhatsApp integration not found" });
    }

    let warning = "";
    if (integration.wabaId) {
      try {
        await metaOnboarding.unsubscribeWhatsAppBusinessAccount({
          accessToken: integration.getAccessToken(),
          wabaId: integration.wabaId,
        });
      } catch (error) {
        warning = "The local connection was removed, but Meta could not confirm webhook unsubscription.";
        console.warn("WhatsApp webhook unsubscribe failed:", error.message);
      }
    }
    await integration.deleteOne();
    res.json({ message: "WhatsApp integration deleted", warning });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

module.exports = router;
