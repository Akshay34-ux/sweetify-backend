// in src/routes/cartRoutes.js
import express from 'express';
import mongoose from 'mongoose';
import Cart from '../models/Cart.js';
import { protect } from '../middleware/authMiddleware.js';
const router = express.Router();

function coerceCartItems(rawItems = []) {
  return rawItems.map(it => {
    const idStr = it.item || it.itemId || it._id;
    if (!idStr) throw new Error("Missing item id in payload");
    if (!/^[0-9a-fA-F]{24}$/.test(String(idStr))) throw new Error("Invalid item id: " + String(idStr));
    return { item: new mongoose.Types.ObjectId(String(idStr)), quantity: Number(it.quantity || 1) };
  });
}

router.post('/sync', protect, async (req, res) => {
  try {
    const incoming = Array.isArray(req.body.items) ? req.body.items : [];
    const itemsForCart = coerceCartItems(incoming);
    let cart = await Cart.findOne({ user: req.user._id });
    if (!cart) cart = new Cart({ user: req.user._id, items: itemsForCart });
    else cart.items = itemsForCart;
    await cart.save();
    res.json({ message: 'Cart synced', cart });
  } catch (err) {
    console.error('POST /api/cart/sync error:', err);
    res.status(400).json({ message: err.message || 'Sync failed' });
  }
});

export default router;