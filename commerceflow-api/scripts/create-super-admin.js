import readline from "node:readline";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import User from "../src/modules/users/user.model.js";
import { verifyDatabaseTarget } from "./safety-helper.js";
import { ROLES } from "../src/config/roles.js";

dotenv.config();

const mongoUri =
  process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/commerceflow";

// 1. Verify database target safety (fail closed on remote/production/ambiguous targets)
const safetyCheck = verifyDatabaseTarget({
  mongoUri,
  nodeEnv: process.env.NODE_ENV,
  stagingOverrideEnvVar: "ALLOW_STAGING_SUPER_ADMIN_CREATION",
  confirmDatabase: process.env.CONFIRM_TARGET_DB,
  overrideEnvVar: "ALLOW_PRODUCTION_SUPER_ADMIN_CREATION",
});

if (!safetyCheck.allowed) {
  console.error("==================================================");
  console.error("SUPER ADMIN BOOTSTRAP SAFETY BLOCK");
  console.error("==================================================");
  console.error(
    `Refusing to create super admin: ${safetyCheck.reason}`
  );
  console.error(`Target Host: ${safetyCheck.target.host}`);
  console.error(`Target DB:   ${safetyCheck.target.database}`);
  console.error(`Environment: ${safetyCheck.environment}`);
  console.error("");
  console.error(
    "For remote staging databases, the following are strictly required:"
  );
  console.error("  NODE_ENV=staging");
  console.error("  ALLOW_STAGING_SUPER_ADMIN_CREATION=true");
  console.error(`  CONFIRM_TARGET_DB=${safetyCheck.target.database !== "unknown" && safetyCheck.target.database !== "none" ? safetyCheck.target.database : "<database_name>"}`);
  console.error("");
  console.error("Note: Production administrative mutation is strictly locked out.");
  console.error("==================================================");
  process.exit(1);
}

// 2. Parse arguments and flags
const args = process.argv.slice(2);
const allowResetPassword = args.includes("--reset-password");
const nonFlagArgs = args.filter((a) => !a.startsWith("--"));

const emailArg = nonFlagArgs[0];
let passwordArg = process.env.SUPER_ADMIN_PASSWORD || nonFlagArgs[1];
const nameArg = nonFlagArgs[2] || "Super Administrator";

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function promptPassword() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question("Enter super admin password (min 8 chars): ", (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function run() {
  if (!emailArg) {
    console.error(
      "Usage: node scripts/create-super-admin.js <email> [password] [name] [--reset-password]"
    );
    console.error(
      "Tip: Set SUPER_ADMIN_PASSWORD environment variable to avoid exposing passwords in shell history."
    );
    process.exit(1);
  }

  const email = emailArg.trim().toLowerCase();
  if (!emailRegex.test(email)) {
    console.error(`Error: "${email}" is not a valid email address.`);
    process.exit(1);
  }

  if (!passwordArg) {
    if (process.stdin.isTTY) {
      passwordArg = await promptPassword();
    } else {
      console.error(
        "Error: Password is required. Provide as argument, interactive input, or via SUPER_ADMIN_PASSWORD."
      );
      process.exit(1);
    }
  }

  if (!passwordArg || passwordArg.length < 8) {
    console.error("Error: Super Admin password must contain at least 8 characters.");
    process.exit(1);
  }

  const name = nameArg.trim();

  try {
    if (safetyCheck.isStagingOverride) {
      console.warn("==================================================");
      console.warn("WARNING: EXECUTING WITH STAGING OVERRIDE");
      console.warn("==================================================");
    }

    console.log("Target Database Configuration:");
    console.log(`  Host:        ${safetyCheck.target.host}`);
    console.log(`  Database:    ${safetyCheck.target.database}`);
    console.log(`  Environment: ${safetyCheck.environment}`);

    await mongoose.connect(mongoUri);

    let user = await User.findOne({ email }).select("+password");

    if (user) {
      // Existing user handling: NEVER silently reset an existing user's password
      if (user.role === ROLES.SUPER_ADMIN) {
        if (!allowResetPassword) {
          console.log(
            `User "${email}" already exists and is already a super administrator. No changes made.`
          );
          await mongoose.disconnect();
          process.exit(0);
        }
      } else {
        // User exists as customer or admin
        if (!allowResetPassword) {
          console.error("==================================================");
          console.error("DELIBERATE ACTION REQUIRED");
          console.error("==================================================");
          console.error(
            `User "${email}" already exists with role: "${user.role}".`
          );
          console.error(
            "To promote this user WITHOUT resetting their password, run:"
          );
          console.error(`  node scripts/promote-super-admin.js ${email}`);
          console.error("");
          console.error(
            "To explicitly overwrite their password and grant super_admin role, re-run with:"
          );
          console.error(
            `  node scripts/create-super-admin.js ${email} [password] --reset-password`
          );
          console.error("==================================================");
          await mongoose.disconnect();
          process.exit(1);
        }
      }

      // Explicit password reset requested with --reset-password
      const hashedPassword = await bcrypt.hash(passwordArg, 12);
      user.role = ROLES.SUPER_ADMIN;
      user.password = hashedPassword;
      if (name && name !== "Super Administrator") user.name = name;
      user.isActive = true;
      user.tokenVersion = (user.tokenVersion ?? 0) + 1; // Invalidate previous sessions
      await user.save();
      console.log(
        `Explicitly updated existing user "${email}" to role: "${ROLES.SUPER_ADMIN}" with updated credentials.`
      );
    } else {
      // Create new super administrator account
      const hashedPassword = await bcrypt.hash(passwordArg, 12);
      user = await User.create({
        name,
        email,
        password: hashedPassword,
        role: ROLES.SUPER_ADMIN,
        isActive: true,
      });
      console.log(
        `Successfully created new super admin account "${email}" with role: "${ROLES.SUPER_ADMIN}".`
      );
    }

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error(
      "Failed to create/update super admin user:",
      error?.message || "Unknown error"
    );
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  }
}

run();
