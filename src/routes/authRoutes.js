// backend/src/routes/authRoutes.js
import express from "express";
import jwt from "jsonwebtoken";
import User from "../models/User.js";

const router = express.Router();

// Generate JWT Token
const generateToken = (id, role) => {
  return jwt.sign({ id: id.toString(), role }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });
};

// Register Route
router.post("/register", async (req, res) => {
  try {
    const { username, email, password, role } = req.body;

    // Basic validation
    if (!username || !email || !password) {
      return res.status(400).json({ message: "username, email and password are required" });
    }

    // Check if user exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ message: "User already exists" });
    }

    // Create new user (password will be hashed by model pre-save)
    const user = await User.create({ username, email, password, role });

    res.status(201).json({
      message: "User registered successfully",
      user: {
        id: user._id.toString(),
        username: user.username,
        email: user.email,
        role: user.role,
      },
      token: generateToken(user._id, user.role),
    });
  } catch (error) {
    console.error("❌ Register Error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Login Route
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // basic validation
    if (!email || !password) {
      return res.status(400).json({ message: "Email and password required" });
    }

    // IMPORTANT: select password explicitly because User schema uses select: false
    const user = await User.findOne({ email }).select("+password");
    if (!user) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    // matchPassword is defined on the model and compares plain -> hashed
    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    // Build safe user object (omit password)
    const safeUser = {
      id: user._id.toString(),
      username: user.username,
      email: user.email,
      role: user.role,
    };

    res.status(200).json({
      message: "Login successful",
      user: safeUser,
      token: generateToken(user._id, user.role),
    });
  } catch (error) {
    console.error("❌ Login Error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

export default router;