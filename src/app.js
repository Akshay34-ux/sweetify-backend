// src/app.js
import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";
import authRoutes from "./routes/authRoutes.js";
import sweetRoutes from "./routes/sweetRoutes.js";
import cartRoutes from "./routes/cartRoutes.js";

dotenv.config();

const app = express();
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));
app.use(cors());

// Health flag for DB
let dbConnected = false;

/**
 * Connect to MongoDB with retry & exponential backoff.
 * This function never throws — it logs and keeps retrying.
 */
async function connectWithRetry(uri, opts = {}) {
  const baseDelay = 2000; // 2s initial
  const maxAttempts = 10; // optional cap; uses large cap so it effectively retries a long time
  let attempt = 0;

  // default options: increase server selection timeout to handle transient slowness
  const defaultOpts = {
    serverSelectionTimeoutMS: 15000, // 15s
    connectTimeoutMS: 15000,
    // other mongoose options may be added here
  };

  const mOpts = { ...defaultOpts, ...opts };

  while (true) {
    attempt += 1;
    try {
      console.log(`🔌 Attempting MongoDB connection (attempt ${attempt})...`);
      await mongoose.connect(uri, mOpts);
      dbConnected = true;
      console.log("✅ MongoDB Connected");
      // stop retry loop on success
      break;
    } catch (err) {
      dbConnected = false;
      console.error(`❌ Failed to connect to MongoDB (attempt ${attempt}):`, err.message || err);
      // exponential backoff with jitter
      const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), 60000); // cap 60s
      const jitter = Math.round(Math.random() * 1000);
      const wait = delay + jitter;
      console.log(`⏳ Retrying in ${Math.round(wait / 1000)}s...`);
      // optional: if you want to stop after N attempts, add check here.
      await new Promise((res) => setTimeout(res, wait));
    }
  }
}

// basic ping route (works regardless of DB)
app.get("/", (req, res) => {
  res.status(200).json({
    message: "🍬 Sweetify API (healthy) — server running",
    dbConnected,
  });
});

// Middleware: if DB not ready, respond 503 for API routes that need DB.
// This prevents long client-side timeouts and gives clear error messages.
app.use("/api", (req, res, next) => {
  // allow auth login/register endpoints to proceed (they will still fail if DB needed)
  // but in general return 503 so frontend gets quick feedback instead of timeouts
  if (!dbConnected) {
    return res.status(503).json({
      message:
        "Service temporarily unavailable — database not connected. Please try again in a moment.",
    });
  }
  next();
});

// Attach routes (these will see the DB once connected)
app.use("/api/auth", authRoutes);
app.use("/api/sweets", sweetRoutes);
app.use("/api/cart", cartRoutes);

// 404 fallback
app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

// Start the HTTP server immediately (so health endpoints and logs are available).
// The DB connection runs in the background via connectWithRetry.
const PORT = process.env.PORT || 5001;
const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on http://127.0.0.1:${PORT}`);
});

// Start Mongo connection attempts (non-blocking)
const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error("❌ MONGO_URI not set in environment — please set it in .env");
} else {
  connectWithRetry(MONGO_URI).catch((err) => {
    // connectWithRetry should never throw, but catch defensively
    console.error("❌ Unexpected error while connecting to MongoDB:", err);
  });
}

// Graceful shutdown helpers
const gracefulShutdown = async () => {
  console.log("🛑 Shutting down gracefully...");
  try {
    await mongoose.disconnect();
    console.log("🧾 MongoDB disconnected");
  } catch (e) {
    console.warn("⚠️ Error during Mongo disconnect", e);
  }
  server.close(() => {
    console.log("💤 HTTP server closed");
    process.exit(0);
  });
};

process.on("SIGINT", gracefulShutdown);
process.on("SIGTERM", gracefulShutdown);

export default app;