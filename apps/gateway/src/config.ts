import { FailMode } from "@finops/types";

/**
 * Gateway runtime configuration, resolved from environment.
 *
 * NOTE on naming: `UPSTREAM_ANTHROPIC_URL` is where the gateway *forwards* to.
 * It is intentionally NOT called `ANTHROPIC_BASE_URL` — that name belongs to
 * the client (Claude Code) pointing AT this gateway. Keeping them distinct
 * avoids a confusing loopback.
 */
export const config = {
  port: Number(process.env.PORT ?? 4000),
  failMode: FailMode.catch("open").parse(process.env.FAIL_MODE),
  upstreams: {
    anthropic: process.env.UPSTREAM_ANTHROPIC_URL ?? "https://api.anthropic.com",
    openai: process.env.UPSTREAM_OPENAI_URL ?? "https://api.openai.com",
  },
} as const;

export type GatewayRuntimeConfig = typeof config;
