import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  doublePrecision,
  unique,
} from "drizzle-orm/pg-core";

/**
 * Postgres schema (OLTP — config & identity), mirroring MVP_SPEC.md §5.1.
 * Every table carries `orgId` (= tenant); on-prem runs a single org but the
 * column exists from day one so multi-tenant SaaS needs no migration later.
 */

// Tenancy root.
export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  plan: text("plan").notNull().default("self_hosted"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// Cost-center unit — all attribution rolls up to a team.
export const teams = pgTable("teams", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  costCenter: text("cost_center"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// Upstream provider accounts. The real provider API key lives here, ENCRYPTED.
export const providerCredentials = pgTable("provider_credentials", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(), // 'openai' | 'anthropic' | 'azure'
  displayName: text("display_name").notNull(),
  encryptedKey: text("encrypted_key").notNull(), // sealed blob (iv:tag:ciphertext)
  baseUrl: text("base_url"), // override upstream (azure / self-hosted)
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// Virtual keys = what clients actually present. The attribution + control unit.
export const virtualKeys = pgTable("virtual_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  teamId: uuid("team_id").references(() => teams.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  keyPrefix: text("key_prefix").notNull(), // shown in UI, e.g. 'vk_live_ab12'
  keyHash: text("key_hash").notNull().unique(), // sha256 of full secret
  allowedModels: text("allowed_models").array(), // null = all models
  rateLimitRpm: integer("rate_limit_rpm"), // null = unlimited
  status: text("status").notNull().default("active"), // 'active' | 'revoked'
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
});

// Append-only audit of admin actions (compliance evidence).
export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  actorUserId: uuid("actor_user_id"),
  action: text("action").notNull(),
  target: text("target"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// Reference price book (config, low-volume) — drives cost calc in the gateway.
// Prices are USD per MILLION tokens. Cache columns are nullable: a provider/
// model with no prompt-caching support simply leaves them null. Seeded with
// sensible defaults (see scripts/seed-pricing.ts) and editable by the admin.
export const modelPricing = pgTable(
  "model_pricing",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: text("provider").notNull(), // 'openai' | 'anthropic' | 'azure'
    model: text("model").notNull(),
    inputPerMtokUsd: doublePrecision("input_per_mtok_usd").notNull(),
    outputPerMtokUsd: doublePrecision("output_per_mtok_usd").notNull(),
    cacheReadPerMtokUsd: doublePrecision("cache_read_per_mtok_usd"), // discounted reads
    cacheWritePerMtokUsd: doublePrecision("cache_write_per_mtok_usd"), // cache creation
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    providerModel: unique("model_pricing_provider_model_uq").on(t.provider, t.model),
  }),
);

// Spend budgets. teamId null = org-wide cap (aggregates all teams). `action`
// 'block' fails the request closed once the period's spend reaches the limit;
// 'alert' only flags (enforcement is observational). periodType 'daily'|'monthly'.
export const budgets = pgTable("budgets", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  teamId: uuid("team_id").references(() => teams.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  periodType: text("period_type").notNull().default("monthly"), // 'daily' | 'monthly'
  limitUsd: doublePrecision("limit_usd").notNull(),
  action: text("action").notNull().default("block"), // 'alert' | 'block'
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Organization = typeof organizations.$inferSelect;
export type Team = typeof teams.$inferSelect;
export type ProviderCredential = typeof providerCredentials.$inferSelect;
export type VirtualKey = typeof virtualKeys.$inferSelect;
export type ModelPricing = typeof modelPricing.$inferSelect;
export type Budget = typeof budgets.$inferSelect;
