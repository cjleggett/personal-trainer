import { anthropic } from "@ai-sdk/anthropic";

/**
 * Central LLM configuration. Change the provider/model here in ONE place —
 * everything else imports `generationModel`.
 *
 * Because we build against the Vercel AI SDK, swapping providers later (e.g. to
 * OpenAI or Google) is: install the provider package, and change the line below
 * to e.g. `openai("gpt-5")`. The Zod-schema generation code stays identical.
 *
 * Requires ANTHROPIC_API_KEY in the environment (server-side only).
 */
// Production-quality generation. (Was temporarily on claude-haiku-4-5 while
// iterating on prompts.) Opus 4.8 is the most capable Opus-tier model.
export const generationModel = anthropic("claude-opus-4-8");
