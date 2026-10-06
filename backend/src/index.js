const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const multer = require("multer");
const fs = require("fs");
const dns = require("dns");

const config = require("./config");
const ragClient = require("./services/ragClient");
const AdminUser = require("./models/AdminUser");
const { requireAuth, canAccessCompany } = require("./middleware/auth");
const authRouter = require("./routes/auth");
const adminUsersRouter = require("./routes/adminUsers");
const companiesRouter = require("./routes/companies");
const documentsRouter = require("./routes/documents");
const chatRouter = require("./routes/chat");
const whatsappIntegrationsRouter = require("./routes/whatsappIntegrations");
const smsIntegrationsRouter = require("./routes/smsIntegrations");
const whatsappRoutes = require("./modules/whatsapp/whatsapp.routes");
const smsRoutes = require("./modules/sms/sms.routes");
const backupsRouter = require("./routes/backups");
const ordersRouter = require("./routes/orders");
const messengerIntegrationsRouter = require("./routes/messengerIntegrations");
const messengerRoutes = require("./modules/messenger/messenger.routes");
const mediaRouter = require("./routes/media");

const app = express();

dns.setDefaultResultOrder("ipv4first");

fs.mkdirSync(config.uploadDir, { recursive: true });

app.use(cors());
app.use(express.json({
  limit: "1mb",
  verify: (req, _res, buffer) => {
    req.rawBody = Buffer.from(buffer);
  },
}));
app.use(express.urlencoded({ extended: true }));

app.get("/health", async (_req, res) => {
  let ragStatus = "unknown";
  try {
    await ragClient.checkHealth();
    ragStatus = "ok";
  } catch {
    ragStatus = "unavailable";
  }

  res.json({
    status: "ok",
    service: "backend",
    mongodb: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
    ragService: ragStatus,
  });
});

app.use("/api/auth", authRouter);
app.use("/media", mediaRouter);
app.use("/api/admin-users", requireAuth, adminUsersRouter);
app.use("/api/backups", requireAuth, backupsRouter);
app.use("/api/companies", requireAuth, companiesRouter);
app.use("/api/companies/:companyId/documents", requireAuth, documentsRouter);
app.use("/api/companies/:companyId/chat", requireAuth, chatRouter);
app.use("/widget/companies/:companyId/chat", chatRouter);
app.use("/api/companies/:companyId/whatsapp-integration", requireAuth, canAccessCompany, whatsappIntegrationsRouter);
app.use("/api/companies/:companyId/sms-integration", requireAuth, canAccessCompany, smsIntegrationsRouter);
app.use("/api/companies/:companyId/messenger-integration", requireAuth, messengerIntegrationsRouter);
app.use("/api/companies/:companyId/orders", requireAuth, ordersRouter);
app.use("/api/whatsapp", whatsappRoutes);
app.use("/api/sms", smsRoutes);
app.use("/api/messenger", messengerRoutes);

app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: err.message });
  }
  if (err.message === "Only PDF files are allowed") {
    return res.status(400).json({ error: err.message });
  }
  if (err.message === "Only .zip backup files are allowed") {
    return res.status(400).json({ error: err.message });
  }
  res.status(500).json({ error: err.message || "Internal server error" });
});

async function start() {
  try {
    config.validateForStartup();
    await mongoose.connect(config.mongodbUri, {
      serverSelectionTimeoutMS: 30000,
    });
    console.log("MongoDB connected");

    const existingSuperAdmin = await AdminUser.findOne({ role: "superadmin" });
    if (!existingSuperAdmin) {
      const user = new AdminUser({
        name: "Super Admin",
        email: config.superAdminEmail,
        role: "superadmin",
      });
      user.setPassword(config.superAdminPassword);
      await user.save();
      console.log(`Seeded superadmin: ${config.superAdminEmail}`);
    }

    app.listen(config.port, () => {
      console.log(`Backend running on http://localhost:${config.port}`);
    });
  } catch (err) {
    console.error("Failed to start server:", err.message);
    process.exit(1);
  }
}

start();
