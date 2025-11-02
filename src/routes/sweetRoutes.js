// backend/src/routes/sweetRoutes.js
import express from "express";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import Sweet from "../models/Sweet.js";
import { protect } from "../middleware/authMiddleware.js";
import { isAdmin } from "../middleware/adminMiddleware.js";

const router = express.Router();

/**
 * Helper: determine if the incoming request belongs to an admin.
 * Tries to read Authorization header and verify JWT payload role.
 */
function requestIsAdmin(req) {
  try {
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.split(" ")[1] : null;
    if (!token) return false;
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    return payload && payload.role === "admin";
  } catch (err) {
    return false;
  }
}

/**
 * Utility: hide stock for non-admins by converting docs to plain objects.
 */
function hideStockForNonAdmin(sweets, isAdminFlag) {
  if (isAdminFlag) return sweets;
  return sweets.map((s) => {
    const o = s.toObject ? s.toObject() : { ...s };
    o.stock = undefined; // explicitly hide stock
    return o;
  });
}

/**
 * Search endpoint
 * /api/sweets/search?q=&category=&minPrice=&maxPrice=
 */
router.get("/search", async (req, res) => {
  try {
    const { q, category, minPrice, maxPrice } = req.query;
    const filter = {};

    if (q) filter.name = { $regex: q, $options: "i" };
    if (category) filter.category = category;
    if (minPrice || maxPrice) {
      filter.price = {};
      if (minPrice) filter.price.$gte = Number(minPrice);
      if (maxPrice) filter.price.$lte = Number(maxPrice);
    }

    const sweets = await Sweet.find(filter).populate("createdBy", "username email");
    const admin = requestIsAdmin(req);
    const out = hideStockForNonAdmin(sweets, admin);
    return res.status(200).json(out);
  } catch (error) {
    console.error("❌ Search Error:", error);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * Popularity endpoint
 * /api/sweets/popularity
 *
 * - If you maintain a `purchasedCount` (or similar) field on Sweet, it will be used.
 * - Otherwise falls back to most-recent sweets.
 */
router.get("/popularity", async (req, res) => {
  try {
    // try to use purchasedCount if exists, otherwise sort by createdAt
    const sortBy = { purchasedCount: -1, createdAt: -1 };

    // If purchasedCount doesn't exist for any docs, this still works (will return recent items).
    const sweets = await Sweet.find({})
      .sort(sortBy)
      .limit(12)
      .populate("createdBy", "username email");

    const admin = requestIsAdmin(req);
    const out = hideStockForNonAdmin(sweets, admin);
    return res.status(200).json({ sweets: out });
  } catch (err) {
    console.error("GET /api/sweets/popularity error:", err);
    return res.status(500).json({ message: "Failed to fetch popular sweets" });
  }
});

/**
 * Create a new sweet (Protected)
 */
router.post("/", protect, async (req, res) => {
  try {
    const { name, description, price, category, image, stock } = req.body;
    const sweet = await Sweet.create({
      name,
      description,
      price,
      category,
      image,
      stock,
      createdBy: req.user._id,
    });
    return res.status(201).json({ message: "Sweet added successfully!", sweet });
  } catch (error) {
    console.error("❌ Create Sweet Error:", error);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * Get all sweets (Public) - hides stock for non-admin
 */
router.get("/", async (req, res) => {
  try {
    const sweets = await Sweet.find().populate("createdBy", "username email");
    const admin = requestIsAdmin(req);
    const out = hideStockForNonAdmin(sweets, admin);
    return res.status(200).json(out);
  } catch (error) {
    console.error("❌ Get Sweets Error:", error);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * Update sweet (Protected) — only creator or admin may update
 */
router.put("/:id", protect, async (req, res) => {
  try {
    const sweet = await Sweet.findById(req.params.id);
    if (!sweet) return res.status(404).json({ message: "Sweet not found" });

    if (sweet.createdBy.toString() !== req.user._id.toString() && req.user.role !== "admin")
      return res.status(403).json({ message: "Not authorized to update this sweet" });

    const updatedSweet = await Sweet.findByIdAndUpdate(req.params.id, req.body, { new: true });
    return res.status(200).json({ message: "Sweet updated successfully", sweet: updatedSweet });
  } catch (error) {
    console.error("❌ Update Sweet Error:", error);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * Purchase endpoint (Protected)
 * POST /api/sweets/:id/purchase
 */
router.post("/:id/purchase", protect, async (req, res) => {
  try {
    const { quantity = 1 } = req.body;
    const qty = Number(quantity) || 1;
    if (qty <= 0) return res.status(400).json({ message: "Quantity must be >= 1" });

    const sweet = await Sweet.findOneAndUpdate(
      { _id: req.params.id, stock: { $gte: qty } },
      { $inc: { stock: -qty, purchasedCount: qty } }, // increment purchasedCount if present
      { new: true }
    );

    if (!sweet) {
      const maybe = await Sweet.findById(req.params.id).select("stock");
      if (!maybe) return res.status(404).json({ message: "Sweet not found" });
      return res.status(400).json({ message: `Insufficient stock. Only ${maybe.stock} item(s) available.` });
    }

    return res.status(200).json({ message: "Purchase successful", sweet, purchasedQuantity: qty });
  } catch (error) {
    console.error("❌ Purchase Error:", error);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * Restock (Admin only)
 * POST /api/sweets/:id/restock { quantity }
 */
router.post("/:id/restock", protect, isAdmin, async (req, res) => {
  try {
    const { quantity } = req.body;
    const qty = Number(quantity);
    if (!quantity || isNaN(qty) || qty <= 0) return res.status(400).json({ message: "Please provide a valid quantity > 0" });

    const sweet = await Sweet.findByIdAndUpdate(req.params.id, { $inc: { stock: qty } }, { new: true });
    if (!sweet) return res.status(404).json({ message: "Sweet not found" });
    return res.status(200).json({ message: "Restocked successfully", sweet });
  } catch (error) {
    console.error("❌ Restock Error:", error);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * Delete sweet (Admin only)
 */
router.delete("/:id", protect, isAdmin, async (req, res) => {
  try {
    const sweet = await Sweet.findById(req.params.id);
    if (!sweet) return res.status(404).json({ message: "Sweet not found" });
    await sweet.deleteOne();
    return res.status(200).json({ message: "Sweet deleted successfully" });
  } catch (error) {
    console.error("❌ Delete Sweet Error:", error);
    return res.status(500).json({ message: "Server error" });
  }
});

/* Protected test route */
router.get("/private", protect, (req, res) => {
  res.json({ message: `Welcome ${req.user.username}, this is protected!` });
});

export default router;