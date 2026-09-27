const express = require("express");
const Order = require("../models/Order");
const { canAccessCompany } = require("../middleware/auth");

const router = express.Router({ mergeParams: true });
router.use(canAccessCompany);
const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

const STATUSES = ["new", "confirmed", "processing", "shipped", "delivered", "cancelled"];

router.get("/summary", asyncRoute(async (req, res) => {
  const grouped = await Order.aggregate([
    { $match: { companyId: new (require("mongoose").Types.ObjectId)(req.params.companyId) } },
    { $group: { _id: "$status", count: { $sum: 1 }, total: { $sum: "$total" } } },
  ]);
  const counts = Object.fromEntries(STATUSES.map((status) => [status, 0]));
  let revenue = 0;
  grouped.forEach((item) => {
    counts[item._id] = item.count;
    if (item._id !== "cancelled") revenue += item.total;
  });
  res.json({ counts, revenue, total: grouped.reduce((sum, item) => sum + item.count, 0) });
}));

router.get("/", asyncRoute(async (req, res) => {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 30));
  const filter = { companyId: req.params.companyId };
  if (STATUSES.includes(req.query.status)) filter.status = req.query.status;
  if (req.query.channel) filter.channel = req.query.channel;
  if (req.query.search) {
    const safe = String(req.query.search).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    filter.$or = [
      { orderNumber: new RegExp(safe, "i") },
      { "customer.name": new RegExp(safe, "i") },
      { "customer.phone": new RegExp(safe, "i") },
    ];
  }
  const [orders, total] = await Promise.all([
    Order.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    Order.countDocuments(filter),
  ]);
  res.json({ orders, page, limit, total, pages: Math.ceil(total / limit) });
}));

router.get("/:orderId", asyncRoute(async (req, res) => {
  const order = await Order.findOne({ _id: req.params.orderId, companyId: req.params.companyId });
  if (!order) return res.status(404).json({ error: "Order not found" });
  return res.json(order);
}));

router.patch("/:orderId/status", asyncRoute(async (req, res) => {
  const status = String(req.body.status || "");
  if (!STATUSES.includes(status)) return res.status(400).json({ error: "Invalid order status" });
  const order = await Order.findOne({ _id: req.params.orderId, companyId: req.params.companyId });
  if (!order) return res.status(404).json({ error: "Order not found" });
  order.status = status;
  order.statusHistory.push({
    status,
    changedAt: new Date(),
    changedBy: req.user?.email || req.user?._id?.toString() || "admin",
  });
  await order.save();
  return res.json(order);
}));

module.exports = router;
