import pino from "pino";
import { redis } from "../budget/redis";

export { cacheKeyFor } from "./key";

/**
 * Exact-match response cache (MVP — NOT semantic; that's Phase 2). The pure
 * key derivation lives in ./key.ts; this module adds the Redis-backed store.
 */

const logger = pino({ name: "cache" });

export const CACHE_ENABLED = (process.env.CACHE_ENABLED ?? "true") !== "false";
const CACHE_TTL_S = Number(process.env.CACHE_TTL_S ?? 3600);

export type CacheEntry = {
  status: number;
  contentType: string;
  body: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  costUsd: number; // what the original call cost — i.e. what each hit SAVES
};

export async function cacheGet(key: string): Promise<CacheEntry | null> {
  try {
    const v = await redis.get(key);
    return v ? (JSON.parse(v) as CacheEntry) : null;
  } catch (err) {
    logger.warn({ err: String(err) }, "cache get failed — treating as miss");
    return null;
  }
}

export async function cacheSet(key: string, entry: CacheEntry): Promise<void> {
  try {
    await redis.set(key, JSON.stringify(entry), "EX", CACHE_TTL_S);
  } catch (err) {
    logger.warn({ err: String(err) }, "cache set failed");
  }
}
