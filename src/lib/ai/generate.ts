import { generateObject } from "ai";
import type { ModelMessage } from "ai";
import type { z } from "zod";
import { generationModel } from "./config";

/**
 * Thin wrapper around the Vercel AI SDK's `generateObject` that every server
 * action should use. It adds two things the raw call lacks:
 *
 *   1. A hard timeout — the provider can stall (e.g. structured-output/"grammar
 *      compilation" outages) rather than erroring, which otherwise leaves a
 *      request hanging for minutes while the SDK retries. We abort at
 *      GENERATE_TIMEOUT_MS so callers fail fast and the UI can recover.
 *   2. A friendly, user-facing error message — raw SDK errors are noisy and leak
 *      internals ("AI_APICallError: Grammar compilation is temporarily…"). We map
 *      known transient failures to plain English and swallow the rest.
 *
 * On success it returns { ok: true, object }; on any failure { ok: false, error }.
 * Callers never see an exception, so their loading state always clears.
 */

export const GENERATE_TIMEOUT_MS = 45_000;

export type GenerateResult<T> =
  | { ok: true; object: T }
  | { ok: false; error: string };

/** Map a raw error into a short, user-facing message. */
function friendlyMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const lower = raw.toLowerCase();

  // Our own abort (timeout) or the SDK's abort surfaces as an AbortError/timeout.
  if (
    err instanceof Error &&
    (err.name === "AbortError" || err.name === "TimeoutError")
  ) {
    return "The AI coach took too long to respond. Please try again in a moment.";
  }
  // Known transient provider issue: structured-output grammar service is down.
  if (lower.includes("grammar compilation") || lower.includes("temporarily")) {
    return "The AI service is temporarily unavailable. Please try again shortly.";
  }
  if (lower.includes("rate limit") || lower.includes("429")) {
    return "The AI service is busy right now. Please try again in a moment.";
  }
  if (lower.includes("overloaded") || lower.includes("529")) {
    return "The AI service is overloaded right now. Please try again shortly.";
  }
  return "The AI coach ran into a problem. Please try again.";
}

/**
 * Run `generateObject` against the configured model with a timeout and
 * normalized error handling. `schema` is a Zod schema; either `messages` or a
 * one-shot `prompt` may be supplied, alongside a `system` prompt.
 */
export async function generateValidated<T>(input: {
  schema: z.ZodType<T>;
  system: string;
  messages?: ModelMessage[];
  prompt?: string;
}): Promise<GenerateResult<T>> {
  const abortSignal = AbortSignal.timeout(GENERATE_TIMEOUT_MS);
  try {
    // The SDK types require messages XOR prompt as concrete keys (not a
    // conditional spread), so branch on which the caller supplied.
    const { object } = input.messages
      ? await generateObject({
          model: generationModel,
          schema: input.schema,
          system: input.system,
          messages: input.messages,
          abortSignal,
        })
      : await generateObject({
          model: generationModel,
          schema: input.schema,
          system: input.system,
          prompt: input.prompt ?? "",
          abortSignal,
        });
    return { ok: true, object };
  } catch (err) {
    return { ok: false, error: friendlyMessage(err) };
  }
}
