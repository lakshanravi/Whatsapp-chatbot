const express = require("express");
const controller = require("./messenger.controller");

const router = express.Router();
router.get("/webhook", controller.verifyWebhook);
router.post("/webhook", controller.receiveWebhook);

module.exports = router;
