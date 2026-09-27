const mongoose = require("mongoose");

const localizedTextSchema = new mongoose.Schema(
  {
    en: { type: String, default: "", trim: true },
    si: { type: String, default: "", trim: true },
    ta: { type: String, default: "", trim: true },
  },
  { _id: false }
);

const variantSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    sku: { type: String, default: "", trim: true },
    priceAdjustment: { type: Number, default: 0 },
    stock: { type: Number, default: null, min: 0 },
    isActive: { type: Boolean, default: true },
  },
  { _id: true }
);

const productSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      index: true,
    },
    sku: { type: String, required: true, trim: true },
    name: { type: localizedTextSchema, required: true },
    description: { type: localizedTextSchema, default: () => ({}) },
    price: { type: Number, required: true, min: 0 },
    currency: { type: String, default: "LKR", uppercase: true, trim: true },
    stock: { type: Number, default: null, min: 0 },
    variants: { type: [variantSchema], default: [] },
    imageUrl: { type: String, default: "", trim: true },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

productSchema.index({ companyId: 1, sku: 1 }, { unique: true });
productSchema.index({ companyId: 1, isActive: 1, updatedAt: -1 });

module.exports = mongoose.models.Product || mongoose.model("Product", productSchema);
