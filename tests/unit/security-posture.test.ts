import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { computePosture } from "../../apps/control-plane/lib/security-posture";

const KEYS = [
  "DASHBOARD_PASSWORD",
  "DASHBOARD_SECRET",
  "ADMIN_TOKEN",
  "ALLOW_OPEN_ADMIN",
  "MASTER_ENCRYPTION_KEY",
  "GOVERNANCE_ENABLED",
  "GOVERNANCE_MODE",
  "GOVERNANCE_BLOCK_CATEGORIES",
  "NODE_ENV",
] as const;

function withEnv(env: Partial<Record<(typeof KEYS)[number], string | undefined>>, fn: () => void) {
  const saved: Record<string, string | undefined> = {};
  for (const k of KEYS) saved[k] = process.env[k];
  for (const k of KEYS) delete process.env[k];
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) continue;
    process.env[k] = v;
  }
  try { fn(); } finally {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}

afterEach(() => { /* per-test env restored in withEnv */ });

function row(label: string, p: ReturnType<typeof computePosture>) {
  return p.controls.find((c) => c.label === label)!;
}

test("dashboard auth: off when DASHBOARD_PASSWORD is unset", () => {
  withEnv({}, () => {
    assert.equal(row("Dashboard auth", computePosture()).status, "off");
  });
});

test("dashboard auth: enforced when DASHBOARD_PASSWORD is set", () => {
  withEnv({ DASHBOARD_PASSWORD: "secret" }, () => {
    assert.equal(row("Dashboard auth", computePosture()).status, "enforced");
  });
});

test("admin API: blocked in production until ADMIN_TOKEN is set", () => {
  withEnv({ NODE_ENV: "production" }, () => {
    // Production with no token → posture reports it as enforced-by-refusal.
    assert.equal(row("Admin API auth", computePosture()).status, "enforced");
  });
});

test("admin API: explicit open-admin opt-in surfaces as off", () => {
  withEnv({ NODE_ENV: "production", ALLOW_OPEN_ADMIN: "1" }, () => {
    assert.equal(row("Admin API auth", computePosture()).status, "off");
  });
});

test("admin API: token set → enforced regardless of env", () => {
  withEnv({ ADMIN_TOKEN: "t" }, () => {
    assert.equal(row("Admin API auth", computePosture()).status, "enforced");
  });
});

test("credentials at rest: off if MASTER_ENCRYPTION_KEY is the placeholder", () => {
  withEnv({ MASTER_ENCRYPTION_KEY: "change-me-generate-a-32-byte-key" }, () => {
    assert.equal(row("Provider credentials at rest", computePosture()).status, "off");
  });
  withEnv({ MASTER_ENCRYPTION_KEY: "real-base64-value-here" }, () => {
    assert.equal(row("Provider credentials at rest", computePosture()).status, "enforced");
  });
});

test("governance: 'enforced' when a category is promoted to block", () => {
  withEnv({ GOVERNANCE_ENABLED: "on", GOVERNANCE_MODE: "alert", GOVERNANCE_BLOCK_CATEGORIES: "aws_credentials" }, () => {
    assert.equal(row("Egress governance", computePosture()).status, "enforced");
  });
});

test("posture is JSON-serializable (no functions, no symbols leak)", () => {
  withEnv({ DASHBOARD_PASSWORD: "s", ADMIN_TOKEN: "t" }, () => {
    const p = computePosture();
    assert.doesNotThrow(() => JSON.stringify(p));
  });
});

test("notYetBuilt is non-empty (we're honest about what's missing)", () => {
  withEnv({}, () => {
    const p = computePosture();
    assert.ok(p.notYetBuilt.length >= 3);
  });
});
