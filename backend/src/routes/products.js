const express = require("express");
const Product = require("../models/Product");
const { canAccessCompany } = require("../middleware/auth");

const router = express.Router({ mergeParams: true });
router.use(canAccessCompany);
const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

function payload(body) {
  return {
    sku: String(body.sku || "").trim(),
    name: {
      en: String(body.name?.en || body.nameEn || "").trim(),
      si: String(body.name?.si || body.nameSi || "").trim(),
      ta: String(body.name?.ta || body.nameTa || "").trim(),
    },
    description: {
      en: String(body.description?.en || "").trim(),
      si: String(body.description?.si || "").trim(),
      ta: String(body.description?.ta || "").trim(),
    },
    price: Number(body.price),
    currency: String(body.currency || "LKR").trim().toUpperCase(),
    stock: body.stock === "" || body.stock === null || body.stock === undefined
      ? null
      : Number(body.stock),
    variants: Array.isArray(body.variants) ? body.variants : [],
    imageUrl: String(body.imageUrl || "").trim(),
    isActive: body.isActive !== false,
  };
}

function validate(data) {
  if (!data.sku) return "SKU is required";
  if (!data.name.en && !data.name.si && !data.name.ta) return "At least one product name is required";
  if (!Number.isFinite(data.price) || data.price < 0) return "Price must be zero or greater";
  if (data.stock !== null && (!Number.isInteger(data.stock) || data.stock < 0)) {
    return "Stock must be a non-negative whole number";
  }
  return "";
}

router.get("/", asyncRoute(async (req, res) => {
  const products = await Product.find({ companyId: req.params.companyId }).sort({ updatedAt: -1 });
  res.json(products);
}));

router.post("/", asyncRoute(async (req, res) => {
  try {
    const data = payload(req.body);
    const error = validate(data);
    if (error) return res.status(400).json({ error });
    const product = await Product.create({ ...data, companyId: req.params.companyId });
    return res.status(201).json(product);
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ error: "This SKU already exists" });
    return res.status(500).json({ error: error.message });
  }
}));

router.put("/:productId", asyncRoute(async (req, res) => {
  try {
    const data = payload(req.body);
    const error = validate(data);
    if (error) return res.status(400).json({ error });
    const product = await Product.findOneAndUpdate(
      { _id: req.params.productId, companyId: req.params.companyId },
      { $set: data },
      { new: true, runValidators: true }
    );
    if (!product) return res.status(404).json({ error: "Product not found" });
    return res.json(product);
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ error: "This SKU already exists" });
    return res.status(500).json({ error: error.message });
  }
}));

router.delete("/:productId", asyncRoute(async (req, res) => {
  const product = await Product.findOneAndDelete({
    _id: req.params.productId,
    companyId: req.params.companyId,
  });
  if (!product) return res.status(404).json({ error: "Product not found" });
  return res.json({ message: "Product deleted" });
}));

module.exports = router;
