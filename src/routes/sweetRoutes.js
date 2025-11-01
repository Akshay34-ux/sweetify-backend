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
 * This tries to read the Authorization header (if present) and verify the JWT.
 * Returns true if token is valid and role === "admin".
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
 * Utility to remove stock field for non-admin viewers
 */
function hideStockForNonAdmin(sweets, isAdmin) {
  if (isAdmin) return sweets;
  // map to plain objects and set stock to undefined (explicitly hidden)
  return sweets.map((s) => {
    const o = s.toObject ? s.toObject() : { ...s };
    // explicitly hide stock (instead of deleting the key) so frontends see it as "hidden"
    o.stock = undefined;
    return o;
  });
}

/**
 * Search endpoint
 * Query params supported:
 *  - q (text search against name)
 *  - category
 *  - minPrice
 *  - maxPrice
 * Example: /api/sweets/search?q=choco&category=Chocolate&minPrice=10&maxPrice=200
 */
router.get("/search", async (req, res) => {
  try {
    const { q, category, minPrice, maxPrice } = req.query;
    const filter = {};

    if (q) {
      // case-insensitive partial match on name
      filter.name = { $regex: q, $options: "i" };
    }
    if (category) {
      filter.category = category;
    }
    if (minPrice || maxPrice) {
      filter.price = {};
      if (minPrice) filter.price.$gte = Number(minPrice);
      if (maxPrice) filter.price.$lte = Number(maxPrice);
    }

    const sweets = await Sweet.find(filter).populate("createdBy", "username email");
    const isAdmin = requestIsAdmin(req);
    const out = hideStockForNonAdmin(sweets, isAdmin);

    res.status(200).json(out);
  } catch (error) {
    console.error("❌ Search Error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Create a new sweet (Protected)
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

    res.status(201).json({ message: "Sweet added successfully!", sweet });
  } catch (error) {
    console.error("❌ Create Sweet Error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Get all sweets (Public — hides stock for non-admin)
router.get("/", async (req, res) => {
  try {
    const sweets = await Sweet.find().populate("createdBy", "username email");
    const isAdmin = requestIsAdmin(req);
    const out = hideStockForNonAdmin(sweets, isAdmin);
    res.status(200).json(out);
  } catch (error) {
    console.error("❌ Get Sweets Error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Update sweet (Protected) — only creator or admin may update
router.put("/:id", protect, async (req, res) => {
  try {
    const sweet = await Sweet.findById(req.params.id);

    if (!sweet) {
      return res.status(404).json({ message: "Sweet not found" });
    }

    // allow creator or admin
    if (sweet.createdBy.toString() !== req.user._id.toString() && req.user.role !== "admin") {
      return res.status(403).json({ message: "Not authorized to update this sweet" });
    }

    const updatedSweet = await Sweet.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.status(200).json({ message: "Sweet updated successfully", sweet: updatedSweet });
  } catch (error) {
    console.error("❌ Update Sweet Error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * Purchase endpoint
 * - Protected (any authenticated user)
 * - Decrements stock by requested quantity (defaults to 1)
 * - Fails with clear message if insufficient stock
 * Request body example: { "quantity": 2 } (optional, defaults to 1)
 */
router.post("/:id/purchase", protect, async (req, res) => {
  try {
    const { quantity = 1 } = req.body;
    const qty = Number(quantity) || 1;

    if (qty <= 0) {
      return res.status(400).json({ message: "Quantity must be >= 1" });
    }

    // atomic update: ensure we don't go under zero
    const sweet = await Sweet.findOneAndUpdate(
      { _id: req.params.id, stock: { $gte: qty } },
      { $inc: { stock: -qty } },
      { new: true }
    );

    if (!sweet) {
      // try to fetch current stock to provide clearer message
      const maybe = await Sweet.findById(req.params.id).select("stock");
      if (!maybe) {
        return res.status(404).json({ message: "Sweet not found" });
      }
      return res.status(400).json({ message: `Insufficient stock. Only ${maybe.stock} item(s) available.` });
    }

    return res.status(200).json({ message: "Purchase successful", sweet, purchasedQuantity: qty });
  } catch (error) {
    console.error("❌ Purchase Error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * Restock endpoint (Admin only)
 * - Increases stock by the provided quantity (required)
 * Request body example: { "quantity": 10 }
 */
router.post("/:id/restock", protect, isAdmin, async (req, res) => {
  try {
    const { quantity } = req.body;
    const qty = Number(quantity);

    if (!quantity || isNaN(qty) || qty <= 0) {
      return res.status(400).json({ message: "Please provide a valid quantity > 0" });
    }

    const sweet = await Sweet.findByIdAndUpdate(
      req.params.id,
      { $inc: { stock: qty } },
      { new: true }
    );

    if (!sweet) return res.status(404).json({ message: "Sweet not found" });

    res.status(200).json({ message: "Restocked successfully", sweet });
  } catch (error) {
    console.error("❌ Restock Error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Delete sweet (Admin only per spec)
router.delete("/:id", protect, isAdmin, async (req, res) => {
  try {
    const sweet = await Sweet.findById(req.params.id);
    if (!sweet) {
      return res.status(404).json({ message: "Sweet not found" });
    }

    await sweet.deleteOne();
    res.status(200).json({ message: "Sweet deleted successfully" });
  } catch (error) {
    console.error("❌ Delete Sweet Error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Protected test route
router.get("/private", protect, (req, res) => {
  res.json({ message: `Welcome ${req.user.username}, this is protected!` });
});

export default router;