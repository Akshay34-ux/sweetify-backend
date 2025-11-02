// backend/src/app.js
import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";
import authRoutes from "./routes/authRoutes.js"; // ✅ Import auth routes
import sweetRoutes from "./routes/sweetRoutes.js";


// Load environment variables
dotenv.config();

// Initialize app
const app = express();
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));
// Middleware
app.use(cors());
app.use(express.json());


// MongoDB Connection
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => console.error("❌ MongoDB Connection Error:", err));

// Basic test route
app.get("/", (req, res) => {
  res.status(200).json({ message: "🍬 Sweetify API is running perfectly!" });
});

// ✅ Auth routes
app.use("/api/auth", authRoutes);
app.use("/api/sweets", sweetRoutes);


// Fallback route for undefined endpoints
app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

// Start server
const PORT = process.env.PORT || 5001;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on http://127.0.0.1:${PORT}`);
});

export default app;