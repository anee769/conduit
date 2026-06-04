/**
 * Extract token usage from an upstream LLM response — streaming or not, for
 * Anthropic and OpenAI shapes — and normalize it to a single cost-ready record.
 *
 * Normalization rule (so cost calc is provider-agnostic):
 *   inputTokens         = FULL-price input only (cache reads excluded)
 *   cacheReadTokens     = discounted cache-read tokens (the 90% / 50% savings)
 *   cacheCreationTokens = cache-write tokens (Anthropic only)
 *   outputTokens        = generated tokens
 */

export type NormalizedUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
};

const ZERO: NormalizedUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheCreationTokens: 0,
};

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/** Pull `data:` JSON payloads out of an SSE byte/text stream. */
function* sseData(text: string): Generator<unknown> {
  for (const line of text.split("\n")) {
    const trimmed = line.trimStart();
    if (!trimmed.startsWith("data:")) continue;
    const payload = trimmed.slice(5).trim();
    if (!payload || payload === "[DONE]") continue;
    try {
      yield JSON.parse(payload);
    } catch {
      /* partial/non-JSON line — ignore */
    }
  }
}

function fromAnthropicUsage(usage: any): Partial<NormalizedUsage> {
  return {
    inputTokens: num(usage?.input_tokens),
    outputTokens: num(usage?.output_tokens),
    cacheReadTokens: num(usage?.cache_read_input_tokens),
    cacheCreationTokens: num(usage?.cache_creation_input_tokens),
  };
}

function fromOpenAIUsage(usage: any): NormalizedUsage {
  const cached = num(usage?.prompt_tokens_details?.cached_tokens);
  const prompt = num(usage?.prompt_tokens);
  return {
    inputTokens: Math.max(0, prompt - cached),
    outputTokens: num(usage?.completion_tokens),
    cacheReadTokens: cached,
    cacheCreationTokens: 0,
  };
}

/**
 * @param provider    "anthropic" | "openai"
 * @param contentType upstream response content-type (decides SSE vs JSON)
 * @param body        the full response text (background-accumulated; never on
 *                    the client's critical path)
 */
export function parseUsage(
  provider: "anthropic" | "openai",
  contentType: string,
  body: string,
): NormalizedUsage {
  const isSse = contentType.includes("text/event-stream");

  if (!isSse) {
    try {
      const json = JSON.parse(body);
      if (provider === "anthropic") {
        return { ...ZERO, ...fromAnthropicUsage(json?.usage) };
      }
      return json?.usage ? fromOpenAIUsage(json.usage) : ZERO;
    } catch {
      return ZERO;
    }
  }

  // Streaming.
  if (provider === "anthropic") {
    const acc: NormalizedUsage = { ...ZERO };
    for (const evt of sseData(body) as Generator<any>) {
      if (evt?.type === "message_start" && evt?.message?.usage) {
        const u = fromAnthropicUsage(evt.message.usage);
        acc.inputTokens = u.inputTokens ?? acc.inputTokens;
        acc.cacheReadTokens = u.cacheReadTokens ?? acc.cacheReadTokens;
        acc.cacheCreationTokens = u.cacheCreationTokens ?? acc.cacheCreationTokens;
        acc.outputTokens = u.outputTokens ?? acc.outputTokens;
      } else if (evt?.type === "message_delta" && evt?.usage) {
        // output_tokens here is cumulative — overwrite.
        acc.outputTokens = num(evt.usage.output_tokens) || acc.outputTokens;
      }
    }
    return acc;
  }

  // OpenAI streaming: usage rides the final chunk (requires the client to send
  // stream_options.include_usage). Last non-null usage object wins.
  let last: NormalizedUsage | null = null;
  for (const chunk of sseData(body) as Generator<any>) {
    if (chunk?.usage) last = fromOpenAIUsage(chunk.usage);
  }
  return last ?? ZERO;
}
