const { mapIncomingWebhook } = require("./sms.mapper");
const smsService = require("./sms.service");

async function receiveWebhook(req, res) {
  const message = mapIncomingWebhook(req.body);

  if (!message.senderPhoneNumber || !message.receiverPhoneNumber) {
    return res.status(200).json({ status: "ignored" });
  }

  try {
    const result = await smsService.replyToIncomingMessage(message, req);

    return res.status(200).json({
      status: "received",
      result,
    });
  } catch (err) {
    return res.status(err.status || err.statusCode || 500).json({
      status: "failed",
      error: {
        message: err.message,
        companyId: err.smsContext?.companyId,
        accountSid: err.smsContext?.accountSid,
        phoneNumber: err.smsContext?.phoneNumber,
        authTokenLast4: err.smsContext?.authTokenLast4,
        code: err.code,
        moreInfo: err.moreInfo,
      },
    });
  }
}

async function receiveStatus(req, res) {
  try {
    const result = await smsService.updateMessageStatus(req.body, req);

    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({
      error: err.message,
    });
  }
}

async function sendTextMessage(req, res) {
  try {
    const { to, text, companyId } = req.body;

    const result = await smsService.sendTextMessage({
      to,
      text,
      companyId,
    });

    return res.status(200).json({
      status: "sent",
      result,
    });
  } catch (err) {
    return res.status(err.status || err.statusCode || 500).json({
      error: err.message,
      companyId: err.smsContext?.companyId,
      accountSid: err.smsContext?.accountSid,
      phoneNumber: err.smsContext?.phoneNumber,
      authTokenLast4: err.smsContext?.authTokenLast4,
      code: err.code,
      moreInfo: err.moreInfo,
    });
  }
}

module.exports = {
  receiveWebhook,
  receiveStatus,
  sendTextMessage,
};
