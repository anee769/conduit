import { eq } from "drizzle-orm";
import { db } from "./client";
import { budgets, type Budget } from "./schema";

/** Create a budget. teamId omitted/null = org-wide cap. */
export async function createBudget(args: {
  orgId: string;
  teamId?: string | null;
  name: string;
  periodType?: "daily" | "monthly";
  limitUsd: number;
  action?: "alert" | "block";
}): Promise<string> {
  const [row] = await db
    .insert(budgets)
    .values({
      orgId: args.orgId,
      teamId: args.teamId ?? null,
      name: args.name,
      periodType: args.periodType ?? "monthly",
      limitUsd: args.limitUsd,
      action: args.action ?? "block",
    })
    .returning({ id: budgets.id });
  return row!.id;
}

/** All enabled budgets (the gateway caches these in memory). */
export async function loadBudgets(): Promise<Budget[]> {
  return db.select().from(budgets).where(eq(budgets.enabled, true));
}

/** All budgets for one org (dashboard). */
export async function listBudgets(orgId: string): Promise<Budget[]> {
  return db.select().from(budgets).where(eq(budgets.orgId, orgId));
}
