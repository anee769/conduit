import { test, before } from "node:test";
import assert from "node:assert/strict";
import { provision, createKey, chat, adminGet, waitFor, uniq, CONTROL_URL } from "../lib/helpers";

const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

let token: string;
let vkId: string;
let keyName: string;
before(async () => {
  const { orgId, teamId } = await provision("attr");
  keyName = `attr-key-${uniq()}`;
  const res = await fetch(`${CONTROL_URL}/api/admin/keys`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(ADMIN_TOKEN ? { "x-admin-token": ADMIN_TOKEN } : {}) },
    body: JSON.stringify({ orgId, teamId, name: keyName }),
  }).then((r) => r.json());
  token = res.virtualKey;
  vkId = res.id;
  // Two successful requests so the key has attributable spend.
  await chat(token, { nonce: uniq() });
  await chat(token, { nonce: uniq() });
});

test("per-key attribution: /api/usage byKey names the key and attributes cost", async () => {
  const row = await waitFor(async () => {
    const data = await adminGet(`/api/usage?days=1`);
    return (data.byKey ?? []).find((k: any) => k.keyId === vkId);
  });
  assert.equal(row.keyName, keyName, "key resolved to its human name");
  assert.ok(row.keyPrefix?.startsWith("vk_live_"), "key prefix surfaced");
  assert.ok(row.requests >= 2, "requests attributed to the key");
  assert.ok(row.costUsd > 0, "cost attributed to the key");
});

test("audit export: CSV is metadata-only and downloadable", async () => {
  // Wait until the key's events are queryable via the audit view.
  await waitFor(async () => {
    const data = await adminGet(`/api/usage?days=1`);
    return (data.byKey ?? []).some((k: any) => k.keyId === vkId);
  });

  const res = await fetch(`${CONTROL_URL}/api/audit?days=1&format=csv`, {
    headers: ADMIN_TOKEN ? { "x-admin-token": ADMIN_TOKEN } : {},
  });
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type") ?? "", /text\/csv/);
  assert.match(res.headers.get("content-disposition") ?? "", /attachment; filename=.*\.csv/);

  const csv = await res.text();
  const header = csv.split(/\r?\n/)[0] ?? "";
  assert.match(header, /timestamp_utc,team,virtual_key,provider,model/);
  // Metadata only — no prompt/completion columns must ever appear.
  assert.doesNotMatch(header, /prompt|completion|message|body|content/i);
  assert.ok(csv.includes(keyName), "the key's events appear in the export");
});

test("audit export: gated when ADMIN_TOKEN is configured", async (t) => {
  if (!ADMIN_TOKEN) {
    t.skip("ADMIN_TOKEN not set in this env → endpoint is intentionally open");
    return;
  }
  const res = await fetch(`${CONTROL_URL}/api/audit?days=1&format=csv`);
  assert.equal(res.status, 401, "unauthenticated audit export is rejected");
});
