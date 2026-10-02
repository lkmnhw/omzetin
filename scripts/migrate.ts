import { neonDatabase } from "../src/server/db";
import { schema } from "../src/server/schema";
import { existsSync } from "node:fs";
if (existsSync(".env")) process.loadEnvFile(".env");
if (!process.env.DATABASE_URL)
  throw new Error("DATABASE_URL harus diisi melalui environment.");
const db = neonDatabase(process.env.DATABASE_URL);
try {
  await db.query(schema);
  console.log("Omzetin schema ready. No demo data inserted.");
} finally {
  await db.close();
}
