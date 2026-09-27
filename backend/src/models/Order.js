const mongoose = require("mongoose");

const orderItemSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    sku: { type: String, default: "" },
    name: { type: String, required: true },
    variant: { type: String, default: "" },
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    lineTotal: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      index: true,
    },
    orderNumber: { type: String, required: true, unique: true, index: true },
    conversationId: { type: mongoose.Schema.Types.ObjectId, ref: "Conversation", default: null },
    sessionId: { type: String, required: true, index: true },
    channel: {
      type: String,
      enum: ["whatsapp", "messenger", "web", "sms"],
      required: true,
      index: true,
    },
    language: { type: String, enum: ["en", "si", "ta"], default: "en" },
    customer: {
      name: { type: String, required: true },
      phone: { type: String, default: "" },
      externalId: { type: String, default: "" },
      deliveryAddress: { type: String, required: true },
    },
    items: { type: [orderItemSchema], required: true },
    subtotal: { type: Number, required: true, min: 0 },
    deliveryFee: { type: Number, default: 0, min: 0 },
    total: { type: Number, required: true, min: 0 },
    currency: { type: String, default: "LKR" },
    paymentMethod: { type: String, required: true },
    notes: { type: String, default: "" },
    status: {
      type: String,
      enum: ["new", "confirmed", "processing", "shipped", "delivered", "cancelled"],
      default: "new",
      index: true,
    },
    statusHistory: {
      type: [{ status: String, changedAt: Date, changedBy: String }],
      default: () => [{ status: "new", changedAt: new Date(), changedBy: "customer" }],
    },
  },
  { timestamps: true }
);

orderSchema.index({ companyId: 1, status: 1, createdAt: -1 });

module.exports = mongoose.models.Order || mongoose.model("Order", orderSchema);
