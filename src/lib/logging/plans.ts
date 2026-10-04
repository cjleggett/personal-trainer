/**
 * Server-side loader for the plan a workout can be linked to. A logged workout
 * links to a planned day via `(plan_id, plan_day_date)`; the logging form needs
 * that plan's dated days to show the link, warn on a date mismatch, and let the
 * user re-link to a different day. Validates the stored JSONB before trusting it.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { trainingPlanSchema } from "@/lib/ai/schemas";
import { flattenPlanDays, type PlanDay } from "./plan-days";

type Client = SupabaseClient<Database>;

export type LinkablePlan = { id: string; name: string; days: PlanDay[] };

/**
 * The plan to offer for linking, with its days flattened to real dates:
 *   - `planId` given → that specific plan (an existing workout's current link,
 *     which may be archived).
 *   - omitted → the user's active plan, if any.
 * Returns null when there's no such plan or its stored skeleton is malformed.
 */
export async function loadLinkablePlan(
  supabase: Client,
  planId?: string | null,
): Promise<LinkablePlan | null> {
  const base = supabase
    .from("training_plans")
    .select("id, name, start_date, plan"); // RLS scopes to the owner
  const query = planId
    ? base.eq("id", planId)
    : base.eq("status", "active").order("start_date", { ascending: false });

  const { data } = await query.limit(1).maybeSingle();
  if (!data) return null;

  const parsed = trainingPlanSchema.safeParse(data.plan);
  if (!parsed.success) return null;

  return {
    id: data.id,
    name: data.name,
    days: flattenPlanDays(parsed.data, data.start_date),
  };
}
