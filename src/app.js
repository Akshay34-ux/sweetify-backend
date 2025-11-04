// backend/src/app.js
import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";
import authRoutes from "./routes/authRoutes.js";
import sweetRoutes from "./routes/sweetRoutes.js";
import cartRoutes from "./routes/cartRoutes.js";

// Load environment variables early
dotenv.config();

const PORT = process.env.PORT || 5001;
const MONGO_URI = process.env.MONGO_URI;
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*"; // change in production

if (!MONGO_URI) {
  // Fail fast with a clear error if DB URI missing
  // This avoids confusing runtime errors later.
  // When deploying, set MONGO_URI in your env.
  // eslint-disable-next-line no-console
  console.error("❌ MONGO_URI is not set. Set it in your environment (.env).");
  process.exit(1);
}

const app = express();

// Basic middleware (only once)
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// CORS - configurable via env
app.use(
  cors({
    origin: CORS_ORIGIN,
    credentials: true,
  })
);

// Optional: trust proxy when behind a reverse proxy / platform (uncomment if required)
// app.set("trust proxy", true);

// Simple health endpoint
app.get("/healthz", (req, res) => res.status(200).send("ok"));

// Basic test route
app.get("/", (req, res) => {
  res.status(200).json({ message: "🍬 Sweetify API is running!" });
});

// Mount routes (these are fine to register before DB connected — handlers will use mongoose)
app.use("/api/auth", authRoutes);
app.use("/api/sweets", sweetRoutes);
app.use("/api/cart", cartRoutes);

// Centralized error handler (last middleware)
app.use((err, req, res, next) => {
  // eslint-disable-next-line no-console
  console.error("Unhandled error:", err && err.stack ? err.stack : err);
  // Avoid leaking internal details in production
  res.status(err?.status || 500).json({ message: err?.message || "Server error" });
});

// Start server after successful DB connection
async function startServer() {
  try {
    // connect with modern options and a reasonable selection timeout
    await mongoose.connect(MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000, // fail fast if atlas / db is unreachable
    });
    // eslint-disable-next-line no-console
    console.log("✅ MongoDB Connected");

    // start HTTP server
    const server = app.listen(PORT, "0.0.0.0", () => {
      // eslint-disable-next-line no-console
      console.log(`🚀 Server running on http://127.0.0.1:${PORT}`);
    });

    // graceful shutdown helpers
    const graceful = (signal) => {
      return async () => {
        // eslint-disable-next-line no-console
        console.log(`\nReceived ${signal}. Closing HTTP server and Mongo connection...`);
        server.close(async () => {
          try {
            await mongoose.disconnect();
            // eslint-disable-next-line no-console
            console.log("✅ MongoDB disconnected. Exiting.");
            process.exit(0);
          } catch (e) {
            // eslint-disable-next-line no-console
            console.error("Error during disconnect:", e);
            process.exit(1);
          }
        });
      };
    };

    process.on("SIGINT", graceful("SIGINT"));
    process.on("SIGTERM", graceful("SIGTERM"));

    // helpful listeners for debugging DB connectivity problems
    mongoose.connection.on("error", (err) => {
      // eslint-disable-next-line no-console
      console.error("❌ MongoDB connection error:", err);
    });
    mongoose.connection.on("disconnected", () => {
      // eslint-disable-next-line no-console
      console.warn("⚠️ MongoDB disconnected");
    });
    mongoose.connection.on("reconnected", () => {
      // eslint-disable-next-line no-console
      console.log("🔁 MongoDB reconnected");
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("❌ Failed to connect to MongoDB:", err && err.message ? err.message : err);
    // for development we exit so process manager can restart; in prod you could retry with backoff
    process.exit(1);
  }
}

// global unhandled rejections / exceptions
process.on("unhandledRejection", (reason, promise) => {
  // eslint-disable-next-line no-console
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});
process.on("uncaughtException", (err) => {
  // eslint-disable-next-line no-console
  console.error("Uncaught Exception:", err);
  // exit to avoid unknown broken state
  process.exit(1);
});

startServer();

export default app;