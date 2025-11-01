import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();
import User from "../src/models/User.js";

async function makeAdmin() {
  await mongoose.connect(process.env.MONGO_URI);
  const email = process.argv[2];
  if (!email) {
    console.log("Usage: node makeAdmin.js user@example.com");
    process.exit(1);
  }
  const u = await User.findOne({ email });
  if (!u) {
    console.log("User not found:", email);
    process.exit(1);
  }
  u.role = "admin";
  await u.save();
  console.log("User promoted to admin:", email);
  await mongoose.disconnect();
}
makeAdmin().catch(err => { console.error(err); process.exit(1); });
