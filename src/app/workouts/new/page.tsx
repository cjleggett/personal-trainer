import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  WorkoutForm,
  type CatalogExercise,
  type PrefillWorkout,
} from "../WorkoutForm";
import { inferWorkoutType } from "@/lib/logging/metrics";

/**
 * Build a create-mode prefill from query params. Two callers:
 *   - A training-plan day (`?plan=…&day=…&focus=…&target=…`): carries the plan
 *     link (planId + planDayDate) so the dashboard checks the day off once logged.
 *   - The dashboard coach's drafted workout (`?type=…&focus=…&target=…&note=…`):
 *     no plan link, but an explicit `type` and an optional prefilled `note`.
 * Absent any usable param, it's just a blank new-workout form.
 */
function prefillFromParams(
  params: Record<string, string | string[] | undefined>,
): PrefillWorkout | undefined {
  const str = (v: string | string[] | undefined) =>
    typeof v === "string" ? v : "";

  const planId = str(params.plan) || undefined;
  const planDayDate = str(params.day) || undefined;
  const focus = str(params.focus);
  const target = str(params.target);
  const explicitType = str(params.type);
  const note = str(params.note);

  // Nothing to prefill unless we have a plan link or at least a type/focus.
  const fromPlan = !!planId && !!planDayDate;
  if (!fromPlan && !explicitType && !focus) return undefined;

  // Type: explicit wins; else infer from the focus text.
  const workoutType =
    explicitType || (focus ? inferWorkoutType(focus) ?? undefined : undefined);

  // Notes: an explicit note (coach draft) wins; else echo the plan target.
  const notes = note || (fromPlan && target ? `Plan target: ${target}` : undefined);

  return {
    planId,
    planDayDate,
    workoutType,
    title: focus || undefined,
    target: target || undefined,
    notes,
  };
}

export default async function NewWorkoutPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: exercises }, params] = await Promise.all([
    supabase
      .from("exercises")
      .select("id, name, muscle_group, measurement_type")
      .order("name"),
    searchParams,
  ]);

  const prefill = prefillFromParams(params);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-4 sm:p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">
          {prefill ? "Log planned workout" : "New workout"}
        </h1>
        <Link href="/dashboard" className="text-sm text-zinc-500 hover:underline">
          Cancel
        </Link>
      </header>
      <WorkoutForm
        catalog={(exercises as CatalogExercise[]) ?? []}
        prefill={prefill}
      />
    </main>
  );
}
