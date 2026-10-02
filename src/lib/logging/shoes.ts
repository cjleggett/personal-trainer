import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { METERS_PER_MILE } from "@/lib/logging/metrics";

/**
 * Running shoes and their accumulated mileage. A shoe's tracked distance is its
 * `starting_distance_m` plus the summed distance of every workout attached to
 * it. Distances are canonical meters in the DB; `distanceMi` is the display
 * value (miles) callers render. All reads are RLS-scoped to the owner.
 */

type Client = SupabaseClient<Database>;

export type ShoeWithMileage = {
  id: string;
  name: string;
  startingDistanceM: number;
  /** starting + all attached workouts' distance, in meters. */
  totalDistanceM: number;
  /** Convenience: totalDistanceM in miles, rounded to 0.1. */
  distanceMi: number;
};

const mi = (meters: number) => Math.round((meters / METERS_PER_MILE) * 10) / 10;

/**
 * List the user's shoes with current mileage, most-recently-created first. Sums
 * each shoe's attached-workout distance in one query (join through workouts →
 * exercise_instances' generated summary column) and folds in the starting value.
 */
export async function listShoesWithMileage(
  supabase: Client,
  userId: string,
): Promise<ShoeWithMileage[]> {
  const { data: shoes } = await supabase
    .from("shoes")
    .select("id, name, starting_distance_m, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (!shoes || shoes.length === 0) return [];

  // Sum distance per shoe across all attached workouts' instances. One row per
  // instance; `workouts!inner(shoe_id)` restricts to workouts that have a shoe.
  const { data: rows } = await supabase
    .from("exercise_instances")
    .select("total_distance_m, workouts!inner(shoe_id)")
    .eq("user_id", userId)
    .not("workouts.shoe_id", "is", null);

  const summed = new Map<string, number>();
  for (const r of rows ?? []) {
    const shoeId = (r.workouts as { shoe_id: string | null } | null)?.shoe_id;
    if (!shoeId) continue;
    summed.set(shoeId, (summed.get(shoeId) ?? 0) + (r.total_distance_m ?? 0));
  }

  return shoes.map((s) => {
    const starting = Number(s.starting_distance_m) || 0;
    const totalDistanceM = starting + (summed.get(s.id) ?? 0);
    return {
      id: s.id,
      name: s.name,
      startingDistanceM: starting,
      totalDistanceM,
      distanceMi: mi(totalDistanceM),
    };
  });
}
