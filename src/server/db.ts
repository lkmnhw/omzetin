import type { PGlite } from "@electric-sql/pglite";
import { Pool } from "@neondatabase/serverless";
export interface Queryable {
  query<T = Record<string, any>>(
    sql: string,
    params?: any[],
  ): Promise<{ rows: T[] }>;
}
export interface Database extends Queryable {
  transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}
export function localDatabase(db: PGlite): Database {
  return {
    query: (sql, params) => db.query(sql, params),
    transaction: (fn) => db.transaction((tx) => fn(tx)),
    close: () => db.close(),
  };
}
export function neonDatabase(url: string): Database {
  const pool = new Pool({ connectionString: url });
  return {
    query: async <T>(sql: string, params?: any[]) => {
      const result = await pool.query(sql, params);
      return { rows: result.rows as T[] };
    },
    transaction: async (fn) => {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await fn(client);
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}
