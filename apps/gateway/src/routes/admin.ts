import { Hono } from "hono";
import type { Context } from "hono";
import pino from "pino";
import { loadPricing } from "../metering/pricing";
import { loadBudgetCache } from "../budget/enforce";
import { reloadGovernance } from "../governance/policy";

const logger = pino({ name: "admin" });

/**
 * Gateway admin surface. `POST /admin/reload` re-reads the in-memory pricing
 * and budget caches from Postgres without a restart — used by ops after a price
 * or budget change, and by the test suite to make new budgets take effect
 * immediately. Guarded by ADMIN_TOKEN when set.
 */
export const adminRoutes = new Hono();

function authed(c: Context): boolean {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) return true; // unset → open (dev / on-prem single admin)
  const auth = c.req.header("authorization");
  const bearer = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : null;
  return (bearer ?? c.req.header("x-admin-token")) === expected;
}

adminRoutes.post("/admin/reload", async (c) => {
  if (!authed(c)) return c.json({ error: "admin authentication required" }, 401);
  await Promise.all([loadPricing(), loadBudgetCache()]);
  reloadGovernance();
  logger.info("config reloaded (pricing + budgets + governance)");
  return c.json({ reloaded: true });
});
