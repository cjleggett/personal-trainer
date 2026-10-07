import { generateObject, generateText, Output, stepCountIs } from "ai";
import type { ModelMessage, ToolSet, LanguageModelUsage } from "ai";
import type { z } from "zod";
import { generationModel, GENERATION_MODEL_ID } from "./config";
import { recordTokenUsage } from "@/lib/logging/token-usage";

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

/**
 * The tool-using path (coach, plan-edit) gets a longer timeout than a single-shot
 * call: one "turn" can be several sequential model round-trips (up to
 * DEFAULT_MAX_STEPS) — a couple of history lookups, maybe a catalog write, then
 * the final structured answer — so the 45s single-call budget is too tight for
 * the chain. Single-shot calls (intake, plan generation) keep the shorter budget
 * so a genuinely stuck request still fails fast and the UI recovers.
 */
export const GENERATE_TOOLS_TIMEOUT_MS = 90_000;

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
 * Prepend a current-date line to a system prompt. Done centrally here so EVERY
 * model call (coach, intake, plan) is grounded in today's date on every turn —
 * not just the opening user message, where it scrolls out of attention on long
 * or resumed conversations and the model loses track of what day it is. Includes
 * the weekday since that's the usual point of confusion. Computed server-side at
 * call time (the app's runtime TZ).
 */
function withCurrentDate(system: string): string {
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  return `Today's date is ${today}.\n\n${system}`;
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
  /** Tags the token-usage record so the /usage page can break down by feature. */
  feature?: string;
}): Promise<GenerateResult<T>> {
  const abortSignal = AbortSignal.timeout(GENERATE_TIMEOUT_MS);
  const system = withCurrentDate(input.system);
  try {
    // The SDK types require messages XOR prompt as concrete keys (not a
    // conditional spread), so branch on which the caller supplied.
    const result = input.messages
      ? await generateObject({
          model: generationModel,
          schema: input.schema,
          system,
          messages: input.messages,
          abortSignal,
        })
      : await generateObject({
          model: generationModel,
          schema: input.schema,
          system,
          prompt: input.prompt ?? "",
          abortSignal,
        });

    // Record usage best-effort — never let accounting break the generation.
    await logUsage(result.usage, input.feature);

    return { ok: true, object: result.object };
  } catch (err) {
    return { ok: false, error: friendlyMessage(err) };
  }
}

/** Record a model call's token usage best-effort (see recordTokenUsage). */
async function logUsage(u: LanguageModelUsage, feature?: string) {
  await recordTokenUsage({
    model: GENERATION_MODEL_ID,
    feature: feature ?? null,
    usage: {
      inputTokens: u.inputTokens ?? 0,
      outputTokens: u.outputTokens ?? 0,
      cacheReadTokens: u.inputTokenDetails?.cacheReadTokens ?? 0,
      cacheWriteTokens: u.inputTokenDetails?.cacheWriteTokens ?? 0,
    },
  });
}

/** Default cap on model↔tool round-trips within a single turn. Enough for the
 * coach to run a few queries and then answer; bounds cost and stops loops. */
export const DEFAULT_MAX_STEPS = 6;

/**
 * Like `generateValidated`, but lets the model call `tools` mid-turn before
 * producing its final answer. Uses `generateText` with a structured `output`
 * (so the final result still validates against `schema`) and a step cap so the
 * tool loop always terminates. Token usage is summed across every step.
 *
 * Use this when the model needs to fetch data to answer — e.g. the coach
 * querying the athlete's history. Same timeout + friendly-error contract.
 */
export async function generateValidatedWithTools<T>(input: {
  schema: z.ZodType<T>;
  system: string;
  messages: ModelMessage[];
  tools: ToolSet;
  maxSteps?: number;
  /** Overrides the abort timeout; defaults to the longer tool-loop budget. */
  timeoutMs?: number;
  /** Tags the token-usage record so the /usage page can break down by feature. */
  feature?: string;
}): Promise<GenerateResult<T>> {
  const abortSignal = AbortSignal.timeout(
    input.timeoutMs ?? GENERATE_TOOLS_TIMEOUT_MS,
  );
  try {
    const result = await generateText({
      model: generationModel,
      system: withCurrentDate(input.system),
      messages: input.messages,
      tools: input.tools,
      stopWhen: stepCountIs(input.maxSteps ?? DEFAULT_MAX_STEPS),
      output: Output.object({ schema: input.schema }),
      abortSignal,
    });

    // `totalUsage` sums every step (each tool round-trip is its own model call).
    await logUsage(result.totalUsage, input.feature);

    return { ok: true, object: result.output };
  } catch (err) {
    return { ok: false, error: friendlyMessage(err) };
  }
}
