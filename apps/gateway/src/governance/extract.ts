/**
 * Extract the newest user-supplied text from a JSON request body.
 * Used by the governance scanner to scan only the current turn, not
 * conversation history (which was already evaluated when first sent).
 */
export function extractLastUserText(decoded: string): string | null {
  try {
    const body = JSON.parse(decoded) as Record<string, unknown>;
    const messages = body.messages;
    if (!Array.isArray(messages)) return null;
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i] as { role?: string; content?: unknown };
      if (msg.role !== "user") continue;
      if (typeof msg.content === "string") return msg.content;
      if (Array.isArray(msg.content)) {
        return msg.content
          .filter((b: { type?: string; text?: string }) => b.type === "text" && typeof b.text === "string")
          .map((b: { text?: string }) => b.text as string)
          .join("\n");
      }
      return null;
    }
    return null;
  } catch {
    return null;
  }
}
