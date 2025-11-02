// backend/scripts/resetPassword.js
import mongoose from "mongoose";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import User from "../src/models/User.js"; // adjust path if needed

dotenv.config();

async function reset() {
  await mongoose.connect(process.env.MONGO_URI);
  const email = process.argv[2];
  const newPass = process.argv[3];

  if (!email || !newPass) {
    console.log("Usage: node resetPassword.js user@example.com newpassword");
    process.exit(1);
  }

  const u = await User.findOne({ email });
  if (!u) {
    console.log("User not found:", email);
    process.exit(1);
  }

  u.password = await bcrypt.hash(newPass, 10);
  await u.save();
  console.log("Password reset for", email);
  await mongoose.disconnect();
  process.exit(0);
}

reset().catch(err => { console.error(err); process.exit(1); });