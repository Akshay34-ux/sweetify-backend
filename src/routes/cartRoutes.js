// backend/src/routes/cartRoutes.js
import express from "express";
import mongoose from "mongoose";
import { protect } from "../middleware/authMiddleware.js";
import Cart from "../models/Cart.js";
import Sweet from "../models/Sweet.js";

const router = express.Router();

/**
 * Normalize body into array of { itemId, quantity }
 * Accepts:
 * - { itemId, quantity }
 * - { item, quantity } where item may be an object with _id
 * - { items: [{ itemId, quantity }, { item, quantity }, ...] }
 */
function normalizePayload(body) {
  if (!body) return [];
  if (Array.isArray(body.items)) {
    return body.items.map((it) => {
      const maybeId = it.itemId || it.item || it._id || (it.item && it.item._id);
      return { itemId: maybeId, quantity: Number(it.quantity || it.qty || 1) };
    });
  }
  const maybeId = body.itemId || body.item || body._id || (body.item && body.item._id);
  if (maybeId) return [{ itemId: maybeId, quantity: Number(body.quantity || body.qty || 1) }];
  return [];
}

/* GET /api/cart - get current user's cart (populated) */
router.get("/", protect, async (req, res) => {
  try {
    const cart = await Cart.findOne({ user: req.user._id }).populate("items.item");
    return res.json({ cart });
  } catch (err) {
    console.error("GET /api/cart error:", err);
    return res.status(500).json({ message: "Failed to fetch cart" });
  }
});

/* POST /api/cart - add/merge items into the user's cart */
router.post("/", protect, async (req, res) => {
  try {
    const raw = normalizePayload(req.body);
    if (!raw.length) return res.status(400).json({ message: "No items provided" });

    // Validate itemIds and prepare normalized array
    const normalized = [];
    for (const it of raw) {
      if (!it.itemId) return res.status(400).json({ message: "Missing itemId for an item" });
      const idStr = String(it.itemId);
      if (!mongoose.Types.ObjectId.isValid(idStr)) {
        return res.status(400).json({ message: `Invalid itemId: ${idStr}` });
      }
      // ensure item exists in sweets collection
      const dbItem = await Sweet.findById(idStr).lean();
      if (!dbItem) return res.status(404).json({ message: `Item not found: ${idStr}` });
      normalized.push({ itemId: idStr, quantity: Math.max(1, Number(it.quantity || 1)) });
    }

    // Find or create cart
    let cart = await Cart.findOne({ user: req.user._id });
    if (!cart) {
      // Build cart items using required 'item' field (ObjectId)
      const itemsForCart = normalized.map((it) => ({
        item: new mongoose.Types.ObjectId(it.itemId),
        quantity: it.quantity,
      }));
      cart = new Cart({ user: req.user._id, items: itemsForCart });
      await cart.save();
      await cart.populate("items.item");
      return res.status(201).json({ cart });
    }

    // Merge into existing cart
    for (const { itemId, quantity } of normalized) {
      const idx = cart.items.findIndex((ci) => String(ci.item) === String(itemId));
      if (idx >= 0) {
        cart.items[idx].quantity = (cart.items[idx].quantity || 0) + quantity;
      } else {
        cart.items.push({ item: new mongoose.Types.ObjectId(itemId), quantity });
      }
    }

    await cart.save();
    await cart.populate("items.item");
    return res.status(200).json({ cart });
  } catch (err) {
    console.error("POST /api/cart error:", err);
    if (err.name === "ValidationError") {
      return res.status(400).json({ message: "Cart validation failed", errors: err.errors });
    }
    return res.status(500).json({ message: "Failed to update cart" });
  }
});

/* DELETE /api/cart/:itemId - remove a single item by its sweet id */
router.delete("/:itemId", protect, async (req, res) => {
  try {
    const { itemId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(String(itemId))) return res.status(400).json({ message: "Invalid itemId" });

    const cart = await Cart.findOne({ user: req.user._id });
    if (!cart) return res.status(404).json({ message: "Cart not found" });

    cart.items = cart.items.filter((it) => String(it.item) !== String(itemId));
    await cart.save();
    await cart.populate("items.item");
    return res.json({ cart });
  } catch (err) {
    console.error("DELETE /api/cart/:itemId error:", err);
    return res.status(500).json({ message: "Failed to remove item" });
  }
});

/* PUT /api/cart - replace entire cart items array */
router.put("/", protect, async (req, res) => {
  try {
    const raw = normalizePayload(req.body);
    // validate and convert
    const normalized = [];
    for (const it of raw) {
      if (!it.itemId) return res.status(400).json({ message: "Missing itemId" });
      if (!mongoose.Types.ObjectId.isValid(String(it.itemId))) return res.status(400).json({ message: "Invalid itemId" });
      const dbItem = await Sweet.findById(it.itemId).lean();
      if (!dbItem) return res.status(404).json({ message: `Item not found: ${it.itemId}` });
      normalized.push({ item: new mongoose.Types.ObjectId(it.itemId), quantity: Math.max(1, Number(it.quantity || 1)) });
    }

    let cart = await Cart.findOne({ user: req.user._id });
    if (!cart) {
      cart = new Cart({ user: req.user._id, items: normalized });
    } else {
      cart.items = normalized;
    }

    await cart.save();
    await cart.populate("items.item");
    return res.json({ cart });
  } catch (err) {
    console.error("PUT /api/cart error:", err);
    return res.status(500).json({ message: "Failed to replace cart" });
  }
});

export default router;