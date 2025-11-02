import mongoose from "mongoose";

// assume req.body.items is [{ item: "69061e...", quantity: 2 }, ...]
function coerceCartItems(rawItems = []) {
  return rawItems.map(it => {
    const idStr = it.item || it.itemId || it._id;
    if (!idStr) throw new Error("Missing item id in payload");

    // Always use `new` to construct ObjectId to avoid the "cannot be invoked without 'new'" error
    const objId = new mongoose.Types.ObjectId(String(idStr));

    return {
      item: objId,
      quantity: Number(it.quantity || 1)
    };
  });
}

router.post("/sync", protect, async (req, res) => {
  try {
    const incoming = req.body.items || [];
    const itemsForCart = coerceCartItems(incoming);
    // find existing cart or create
    let cart = await Cart.findOne({ user: req.user._id });
    if (!cart) {
      cart = new Cart({ user: req.user._id, items: itemsForCart });
    } else {
      cart.items = itemsForCart; // replace on sync or implement merge logic
    }
    await cart.save();
    res.status(200).json({ message: "Cart synced", cart });
  } catch (err) {
    console.error("POST /api/cart/sync error:", err);
    res.status(400).json({ message: err.message || "Sync failed" });
  }
});