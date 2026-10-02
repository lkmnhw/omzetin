import { neonDatabase } from "./db";
import { createApp } from "./app";
interface Bindings {
  DATABASE_URL?: string;
  ASSETS: { fetch(request: Request): Promise<Response> };
}
export default {
  async fetch(
    request: Request,
    env: Bindings,
    ctx: { waitUntil(promise: Promise<any>): void },
  ) {
    if (!new URL(request.url).pathname.startsWith("/api/"))
      return env.ASSETS.fetch(request);
    if (!env.DATABASE_URL)
      return Response.json(
        { error: "Database belum dikonfigurasi. Hubungi pemilik aplikasi." },
        { status: 503 },
      );
    const db = neonDatabase(env.DATABASE_URL);
    try {
      return await createApp(db).fetch(request);
    } finally {
      ctx.waitUntil(db.close());
    }
  },
};
