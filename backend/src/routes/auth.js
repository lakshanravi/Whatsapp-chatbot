const express = require("express");
const AdminUser = require("../models/AdminUser");
const { createToken } = require("../services/auth");
const { requireAuth } = require("../middleware/auth");
const { createRateLimit } = require("../middleware/rateLimit");

const router = express.Router();

const loginRateLimit = createRateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: "Too many login attempts. Try again later.",
});

router.post("/login", loginRateLimit, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const user = await AdminUser.findOne({ email: email.toLowerCase().trim() });
    if (!user || !user.isActive || !user.verifyPassword(password)) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    res.json({ token: createToken(user), user: user.toSafeJSON() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/me", requireAuth, (req, res) => {
  res.json(req.user.toSafeJSON());
});

module.exports = router;
