import { createClient } from "@/lib/supabase/server";
import { costForUsage, type UsageCounts } from "@/lib/ai/pricing";

/**
 * Persist one LLM call's token usage + snapshot cost to `token_usage`.
 *
 * Best-effort: recording is an accounting side-effect, never load-bearing. Any
 * failure (no session, RLS, DB down) is swallowed so it can't break the
 * generation the user actually asked for. Called from generateValidated.
 */
export async function recordTokenUsage(input: {
  model: string;
  feature: string | null;
  usage: UsageCounts;
}): Promise<void> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return; // no session → nothing to attribute; skip silently

    const { model, feature, usage } = input;
    await supabase.from("token_usage").insert({
      user_id: user.id,
      model,
      feature,
      input_tokens: usage.inputTokens,
      output_tokens: usage.outputTokens,
      cache_read_tokens: usage.cacheReadTokens,
      cache_write_tokens: usage.cacheWriteTokens,
      cost_usd: costForUsage(model, usage),
    });
  } catch {
    // Deliberately swallowed — see docstring.
  }
}
