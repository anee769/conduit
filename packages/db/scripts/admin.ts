/**
 * Admin CLI — stands in for the M4 first-run wizard until the UI exists.
 *
 *   pnpm --filter @finops/db seed                 # seed-demo (default)
 *
 * `seed-demo` creates an org + team, stores an (encrypted) provider credential,
 * mints a virtual key, and prints the key token ONCE.
 *
 * The provider API key to store comes from DEMO_PROVIDER_KEY (defaults to a
 * recognizable placeholder so the mock upstream can echo it back in tests).
 */
import { createHash } from "node:crypto";
import {
  createOrg,
  createTeam,
  addProviderCredential,
  createVirtualKey,
  sql,
} from "../src/index";

const command = process.argv[2] ?? "seed-demo";

async function seedDemo() {
  const orgId = await createOrg("Demo Org");
  const teamId = await createTeam(orgId, "Engineering", "CC-1001");

  const providerKey = process.env.DEMO_PROVIDER_KEY ?? "sk-real-anthropic-DEMO";
  await addProviderCredential({
    orgId,
    provider: "anthropic",
    displayName: "Anthropic (demo)",
    apiKey: providerKey,
  });

  const { id, token } = await createVirtualKey({
    orgId,
    teamId,
    name: "Engineering default key",
  });

  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        orgId,
        teamId,
        virtualKeyId: id,
        virtualKey: token,
        storedProviderKeyFingerprint:
          createHash("sha256").update(providerKey).digest("hex").slice(0, 12),
      },
      null,
      2,
    ),
  );
}

async function seedRestricted() {
  const orgId = await createOrg("Restricted Org");
  const teamId = await createTeam(orgId, "Restricted", "CC-2002");
  await addProviderCredential({
    orgId,
    provider: "anthropic",
    displayName: "Anthropic (restricted)",
    apiKey: process.env.DEMO_PROVIDER_KEY ?? "sk-real-anthropic-DEMO",
  });
  // Only allows a single model; anything else must be rejected with 403.
  const { id, token } = await createVirtualKey({
    orgId,
    teamId,
    name: "Haiku-only key",
    allowedModels: ["claude-haiku-4"],
  });
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ orgId, virtualKeyId: id, virtualKey: token, allowedModels: ["claude-haiku-4"] }, null, 2));
}

try {
  if (command === "seed-demo") {
    await seedDemo();
  } else if (command === "seed-restricted") {
    await seedRestricted();
  } else {
    // eslint-disable-next-line no-console
    console.error(`unknown command: ${command}`);
    process.exitCode = 1;
  }
} finally {
  await sql.end();
}
