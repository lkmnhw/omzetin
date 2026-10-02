import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { serve } from "@hono/node-server";
import { mkdir } from "node:fs/promises";
import { localDatabase } from "./db";
import { schema } from "./schema";
import { seedDemo } from "./seed";
import { createApp } from "./app";
await mkdir(".local", { recursive: true });
const pg = new PGlite({
  dataDir:
    process.env.OMZETIN_DATA_DIR === "memory"
      ? undefined
      : process.env.OMZETIN_DATA_DIR || ".local/data",
  extensions: { pgcrypto },
});
await pg.exec(schema);
const db = localDatabase(pg);
await seedDemo(db);
const app = createApp(db, {
  demo: true,
  localOrigin: process.env.OMZETIN_ORIGIN || "http://127.0.0.1:5173",
});
serve({
  fetch: app.fetch,
  hostname: "127.0.0.1",
  port: Number(process.env.OMZETIN_API_PORT || 8787),
});
console.log(
  `Omzetin API: http://127.0.0.1:${process.env.OMZETIN_API_PORT || 8787} · local demo`,
);
