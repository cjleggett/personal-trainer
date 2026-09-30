/**
 * Model pricing, in one place. Prices are USD per 1,000,000 tokens.
 *
 * Anthropic bills input tokens in three tiers: fresh input, cache *writes*
 * (~1.25× input), and cache *reads* (~0.1× input). Output is a flat rate. We
 * compute a per-call cost from the AI SDK's usage object and snapshot it into
 * the token_usage row, so historical costs survive future price changes.
 */

export type ModelPricing = {
  /** USD per 1M fresh (non-cached) input tokens. */
  inputPerM: number;
  /** USD per 1M output tokens. */
  outputPerM: number;
  /** USD per 1M cache-write input tokens (Anthropic: ~1.25× input). */
  cacheWritePerM: number;
  /** USD per 1M cache-read input tokens (Anthropic: ~0.1× input). */
  cacheReadPerM: number;
};

/** Per-model rates. Keyed by the model id passed to the provider (config.ts). */
export const PRICING: Record<string, ModelPricing> = {
  "claude-opus-4-8": { inputPerM: 5, outputPerM: 25, cacheWritePerM: 6.25, cacheReadPerM: 0.5 },
  "claude-opus-4-7": { inputPerM: 5, outputPerM: 25, cacheWritePerM: 6.25, cacheReadPerM: 0.5 },
  "claude-sonnet-4-6": { inputPerM: 3, outputPerM: 15, cacheWritePerM: 3.75, cacheReadPerM: 0.3 },
  "claude-haiku-4-5": { inputPerM: 1, outputPerM: 5, cacheWritePerM: 1.25, cacheReadPerM: 0.1 },
};

/** Token counts from a single LLM call (from the AI SDK usage object). */
export type UsageCounts = {
  /** Total input/prompt tokens, INCLUDING cache reads and writes. */
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
};

/**
 * Cost in USD for one call. Fresh input = total input minus the cached portions
 * (which bill at their own rates). Falls back to base input pricing for any
 * unknown model so a new model never silently records $0.
 */
export function costForUsage(model: string, u: UsageCounts): number {
  const p = PRICING[model] ?? { inputPerM: 5, outputPerM: 25, cacheWritePerM: 6.25, cacheReadPerM: 0.5 };
  const fresh = Math.max(0, u.inputTokens - u.cacheReadTokens - u.cacheWriteTokens);
  const usd =
    (fresh * p.inputPerM +
      u.cacheReadTokens * p.cacheReadPerM +
      u.cacheWriteTokens * p.cacheWritePerM +
      u.outputTokens * p.outputPerM) /
    1_000_000;
  // Round to 6 dp (µ-dollars) — enough for per-call, sums stay accurate.
  return Math.round(usd * 1_000_000) / 1_000_000;
}

/** Format a USD amount for display, keeping sub-cent precision visible. */
export function formatUsd(amount: number): string {
  if (amount > 0 && amount < 0.01) return `<$0.01`;
  return `$${amount.toFixed(2)}`;
}
