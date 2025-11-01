// backend/src/middleware/adminMiddleware.js
export const isAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: "Not authorized, no user" });
  }

  if (req.user.role !== "admin") {
    return res.status(403).json({ message: "Admin privileges required" });
  }

  next();
};