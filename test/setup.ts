import { existsSync } from "node:fs";

// Load .env for tests (Node 22+ has process.loadEnvFile).
if (existsSync(".env")) {
  try {
    process.loadEnvFile(".env");
  } catch {
    /* ignore */
  }
}

// Deterministic key for crypto tests even if .env lacks one.
if (!process.env.TOKEN_ENCRYPTION_KEY) {
  process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
}
