const express = require("express");

const smsController = require("./sms.controller");
const { requireAuth } = require("../../middleware/auth");

const router = express.Router();

router.post("/webhook", smsController.receiveWebhook);
router.post("/status", smsController.receiveStatus);
router.post("/send", requireAuth, (req, res, next) => {
  const allowed = req.user.role === "superadmin"
    || req.user.companyId?.toString() === String(req.body.companyId || "");
  if (!allowed) return res.status(403).json({ error: "You can only send for your assigned company" });
  return smsController.sendTextMessage(req, res, next);
});

module.exports = router;
