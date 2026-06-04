import { drizzle } from "drizzle-orm/postgres-js";
import { sql as drizzleSql } from "drizzle-orm";
import postgres from "postgres";
import * as schema from "./schema";

const POSTGRES_URL =
  process.env.POSTGRES_URL ?? "postgres://finops:finops@localhost:5432/finops";

// Single shared connection pool for the process.
export const sql = postgres(POSTGRES_URL, { max: 10 });
export const db = drizzle(sql, { schema });

/** Liveness check for /ready. Returns true if Postgres answers. */
export async function ping(): Promise<boolean> {
  await db.execute(drizzleSql`select 1`);
  return true;
}
