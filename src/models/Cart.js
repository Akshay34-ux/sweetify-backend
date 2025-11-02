// src/models/Cart.js
import mongoose from "mongoose";

const { Schema } = mongoose;

const CartItemSchema = new Schema(
  {
    item: {
      type: Schema.Types.ObjectId,
      ref: "Sweet",
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
      default: 1,
    },
  },
  { _id: false } // keep subdocs compact
);

const CartSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true, // ensure one cart per user
    },
    items: {
      type: [CartItemSchema],
      default: [],
    },
  },
  { timestamps: true }
);

// ✅ Safety fix: prevent Mongoose model overwrite errors on hot reload
const Cart = mongoose.models.Cart || mongoose.model("Cart", CartSchema);

export default Cart;