/**
 * Fire-and-forget gateway reload after any budget mutation.
 * The gateway caches budget definitions in memory; without a reload the old
 * list stays live for up to 5 minutes after a create/delete in Postgres.
 */
export async function reloadGateway(): Promise<void> {
  const url = process.env.GATEWAY_INTERNAL_URL ?? "http://gateway:4000";
  const token = process.env.ADMIN_TOKEN;
  if (!token) return;
  try {
    await fetch(`${url}/admin/reload`, {
      method: "POST",
      headers: { "x-admin-token": token },
    });
  } catch {
    // Gateway unreachable (dev without Docker) — not fatal, budget refresh
    // will catch up within 5 minutes via the scheduled reload.
  }
}
