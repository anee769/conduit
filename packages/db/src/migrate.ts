import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const POSTGRES_URL =
  process.env.POSTGRES_URL ?? "postgres://finops:finops@localhost:5432/finops";

const sql = postgres(POSTGRES_URL, { max: 1 });

await migrate(drizzle(sql), { migrationsFolder: "./migrations" });
await sql.end();

// eslint-disable-next-line no-console
console.log("migrations applied");
