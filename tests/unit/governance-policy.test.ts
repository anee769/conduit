import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { effectiveAction, governanceConfig, reloadGovernance } from "../../apps/gateway/src/governance/policy";

/**
 * The alert→block feedback loop: per-category promotion. An org runs in global
 * `alert`, watches which categories fire, then promotes high-confidence ones to
 * block via GOVERNANCE_BLOCK_CATEGORIES — without flipping the whole policy.
 */

function withEnv(env: Record<string, string | undefined>, fn: () => void) {
  const saved: Record<string, string | undefined> = {};
  for (const k of Object.keys(env)) {
    saved[k] = process.env[k];
    if (env[k] === undefined) delete process.env[k];
    else process.env[k] = env[k];
  }
  reloadGovernance();
  try {
    fn();
  } finally {
    for (const k of Object.keys(saved)) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    reloadGovernance();
  }
}

afterEach(() => reloadGovernance());

test("global alert, no promotions → everything alerts", () => {
  withEnv({ GOVERNANCE_MODE: "alert", GOVERNANCE_BLOCK_CATEGORIES: undefined }, () => {
    assert.equal(effectiveAction(["aws_credentials"]), "alert");
    assert.equal(effectiveAction(["github_token", "jwt"]), "alert");
  });
});

test("promoted category blocks even while global mode is alert", () => {
  withEnv({ GOVERNANCE_MODE: "alert", GOVERNANCE_BLOCK_CATEGORIES: "aws_credentials, private_key" }, () => {
    assert.equal(effectiveAction(["aws_credentials"]), "block", "promoted category blocks");
    assert.equal(effectiveAction(["private_key"]), "block");
    assert.equal(effectiveAction(["github_token"]), "alert", "non-promoted still alerts");
    assert.equal(effectiveAction(["github_token", "private_key"]), "block", "any promoted hit blocks");
    assert.deepEqual(governanceConfig().blockCategories, ["aws_credentials", "private_key"]);
  });
});

test("global block → everything blocks regardless of promotions", () => {
  withEnv({ GOVERNANCE_MODE: "block", GOVERNANCE_BLOCK_CATEGORIES: undefined }, () => {
    assert.equal(effectiveAction(["github_token"]), "block");
    assert.equal(effectiveAction(["generic_secret"]), "block");
  });
});

test("block-category list is case/space-insensitive", () => {
  withEnv({ GOVERNANCE_MODE: "alert", GOVERNANCE_BLOCK_CATEGORIES: "  AWS_Credentials ,  JWT " }, () => {
    assert.equal(effectiveAction(["aws_credentials"]), "block");
    assert.equal(effectiveAction(["jwt"]), "block");
  });
});

test("entities: JSON array env → parsed list", () => {
  withEnv({ GOVERNANCE_ENTITIES: '["Acme Corp", "Project Nimbus", "Q4-DEAL-21"]' }, () => {
    assert.deepEqual(governanceConfig().entities, ["Acme Corp", "Project Nimbus", "Q4-DEAL-21"]);
  });
});

test("entities: CSV env → parsed list (whitespace trimmed)", () => {
  withEnv({ GOVERNANCE_ENTITIES: "Acme, Globex ,  Initech " }, () => {
    assert.deepEqual(governanceConfig().entities, ["Acme", "Globex", "Initech"]);
  });
});

test("entities: unset or empty env → empty list (governance ships safe)", () => {
  withEnv({ GOVERNANCE_ENTITIES: undefined }, () => {
    assert.deepEqual(governanceConfig().entities, []);
  });
  withEnv({ GOVERNANCE_ENTITIES: "   " }, () => {
    assert.deepEqual(governanceConfig().entities, []);
  });
});

test("entities: malformed JSON falls back to CSV parsing", () => {
  withEnv({ GOVERNANCE_ENTITIES: "[broken json, no quotes" }, () => {
    // Falls through to CSV; first segment retains the "[" but it doesn't crash.
    const ents = governanceConfig().entities;
    assert.ok(Array.isArray(ents));
    assert.ok(ents.length >= 1);
  });
});
