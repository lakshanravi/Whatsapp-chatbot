function createRateLimit({ windowMs, max, message }) {
  const buckets = new Map();
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [key, value] of buckets) {
      if (value.resetAt <= now) buckets.delete(key);
    }
  }, Math.min(windowMs, 60_000));
  timer.unref();

  return function rateLimit(req, res, next) {
    const now = Date.now();
    const key = req.ip || req.socket?.remoteAddress || "unknown";
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }
    bucket.count += 1;
    res.set("RateLimit-Limit", String(max));
    res.set("RateLimit-Remaining", String(Math.max(0, max - bucket.count)));
    res.set("RateLimit-Reset", String(Math.ceil(bucket.resetAt / 1000)));
    if (bucket.count > max) {
      return res.status(429).json({ error: message || "Too many requests" });
    }
    return next();
  };
}

module.exports = { createRateLimit };
