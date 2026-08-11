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
export const generationModel = anthropic("claude-opus-4-8");

// A cheaper/faster model for high-volume, lower-stakes calls if ever needed.
// export const lightModel = anthropic("claude-haiku-4-5");
