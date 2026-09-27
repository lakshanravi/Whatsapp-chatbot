const express = require("express");

const whatsappController = require("./whatsapp.controller");
const { requireAuth } = require("../../middleware/auth");

const router = express.Router();

router.get("/webhook", whatsappController.verifyWebhook);
router.post("/webhook", whatsappController.receiveWebhook);
router.post("/send", requireAuth, (req, res, next) => {
  const allowed = req.user.role === "superadmin"
    || req.user.companyId?.toString() === String(req.body.companyId || "");
  if (!allowed) return res.status(403).json({ error: "You can only send for your assigned company" });
  return whatsappController.sendTextMessage(req, res, next);
});

module.exports = router;
