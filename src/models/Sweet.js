// backend/src/models/Sweet.js
import mongoose from "mongoose";

const sweetSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    category: {
      type: String,
      enum: ["Chocolate", "Candy", "Pastry", "Other"],
      default: "Other",
    },
    image: {
      type: String,
      default: "https://via.placeholder.com/150", // Default image
    },
    stock: {
      type: Number,
      default: 0,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true }
);

const Sweet = mongoose.model("Sweet", sweetSchema);
export default Sweet;