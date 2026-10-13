import mongoose from "mongoose";
import dotenv from "dotenv";
import User from "../src/modules/users/user.model.js";
import { verifyDatabaseTarget } from "./safety-helper.js";

dotenv.config();

const mongoUri =
  process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/commerceflow";

// 1. Verify database target safety (fail closed on remote/production/ambiguous targets)
const safetyCheck = verifyDatabaseTarget({
  mongoUri,
  nodeEnv: process.env.NODE_ENV,
  overrideEnvVar: "ALLOW_PRODUCTION_ADMIN_PROMOTION",
});

if (!safetyCheck.allowed) {
  console.error("==================================================");
  console.error("ADMIN BOOTSTRAP SAFETY BLOCK");
  console.error("==================================================");
  console.error(
    `Refusing to promote user: ${safetyCheck.reason}.`
  );
  console.error(`Target Host: ${safetyCheck.target.host}`);
  console.error(`Target DB:   ${safetyCheck.target.database}`);
  console.error(`Environment: ${safetyCheck.environment}`);
  console.error("");
  console.error(
    "To target a production or remote database intentionally, set:"
  );
  console.error("  ALLOW_PRODUCTION_ADMIN_PROMOTION=true");
  console.error("==================================================");
  process.exit(1);
}

// 2. Validate input argument
const emailArg = process.argv[2];

if (!emailArg) {
  console.error("Usage: node scripts/promote-admin.js <email>");
  process.exit(1);
}

const email = emailArg.trim().toLowerCase();
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
if (!emailRegex.test(email)) {
  console.error(`Error: "${email}" is not a valid email address.`);
  process.exit(1);
}

async function run() {
  try {
    if (safetyCheck.isProductionOverride) {
      console.warn("==================================================");
      console.warn("WARNING: EXECUTING WITH PRODUCTION OVERRIDE");
      console.warn("==================================================");
    }

    console.log("Target Database Configuration:");
    console.log(`  Host:        ${safetyCheck.target.host}`);
    console.log(`  Database:    ${safetyCheck.target.database}`);
    console.log(`  Environment: ${safetyCheck.environment}`);

    await mongoose.connect(mongoUri);

    const user = await User.findOne({ email });

    if (!user) {
      console.error(`Error: User with email "${email}" not found.`);
      await mongoose.disconnect();
      process.exit(1);
    }

    if (user.role === "admin") {
      console.log(`User "${email}" already has role: "admin". No changes required.`);
      await mongoose.disconnect();
      process.exit(0);
    }

    user.role = "admin";
    await user.save();

    console.log(
      `Successfully promoted existing user "${email}" to role: "admin".`
    );
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error("Failed to promote user:", error?.message || "Unknown error");
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  }
}

run();
