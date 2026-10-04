import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/app/Header";
import {
  WorkoutForm,
  type CatalogExercise,
  type PrefillWorkout,
} from "../WorkoutForm";
import { matchWorkoutTypeName } from "@/lib/logging/metrics";
import { listShoesWithMileage } from "@/lib/logging/shoes";
import { loadLinkablePlan } from "@/lib/logging/plans";

/**
 * Decode the coach's `exercises` param (a JSON array of {name, target, notes})
 * into the prefill's exercise list. Best-effort: malformed JSON or non-string
 * fields are dropped rather than crashing the page.
 */
function parseExercisesParam(
  raw: string,
): PrefillWorkout["exercises"] | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return undefined;
    const exercises = parsed
      .filter(
        (e): e is { name: string; target?: unknown; notes?: unknown } =>
          !!e && typeof e === "object" && typeof e.name === "string",
      )
      .map((e) => ({
        name: e.name,
        target: typeof e.target === "string" ? e.target : undefined,
        notes: typeof e.notes === "string" ? e.notes : undefined,
      }));
    return exercises.length ? exercises : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Build a create-mode prefill from query params. Two callers:
 *   - A training-plan day (`?plan=…&day=…&focus=…&target=…`): carries the plan
 *     link (planId + planDayDate) so the dashboard checks the day off once logged.
 *   - The dashboard coach's drafted workout (`?type=…&focus=…&target=…&note=…`
 *     plus an optional `exercises` JSON array): no plan link, but an explicit
 *     `type`, an optional prefilled `note`, and — for a gym day — the specific
 *     exercises to seed as cards.
 * Absent any usable param, it's just a blank new-workout form.
 */
function prefillFromParams(
  params: Record<string, string | string[] | undefined>,
  typeNames: string[],
): PrefillWorkout | undefined {
  const str = (v: string | string[] | undefined) =>
    typeof v === "string" ? v : "";

  const planId = str(params.plan) || undefined;
  const planDayDate = str(params.day) || undefined;
  const focus = str(params.focus);
  const target = str(params.target);
  const explicitType = str(params.type);
  const exercises = parseExercisesParam(str(params.exercises));

  // Nothing to prefill unless we have a plan link or at least a type/focus/list.
  const fromPlan = !!planId && !!planDayDate;
  if (!fromPlan && !explicitType && !focus && !exercises) return undefined;

  // Type: explicit wins; else match the focus text to an existing catalog type
  // (so the form can preselect it). Pass the real catalog names so the match
  // lands on "Running"/"Cycling" rather than labels the catalog doesn't have.
  const workoutType =
    explicitType ||
    (focus ? matchWorkoutTypeName(focus, typeNames) ?? undefined : undefined);

  // Note: we deliberately don't seed the notes field — it's the user's space for
  // how the session felt. Any coach/plan target seeds the sets, not the notes.
  return {
    planId,
    planDayDate,
    workoutType,
    title: focus || undefined,
    target: target || undefined,
    exercises,
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

  const [{ data: exercises }, { data: workoutTypes }, shoes, params] =
    await Promise.all([
      supabase
        .from("exercises")
        .select("id, name, muscle_group, measurement_type")
        .order("name"),
      supabase.from("workout_types").select("id, name, emoji").order("name"),
      listShoesWithMileage(supabase, user.id),
      searchParams,
    ]);

  const prefill = prefillFromParams(
    params,
    (workoutTypes ?? []).map((t) => t.name),
  );

  // Offer a plan to link against: the one named in the prefill (logging a
  // specific plan day) if present, else the user's active plan. Lets the user
  // link/relink from the form even for an otherwise ad-hoc entry.
  const plan = await loadLinkablePlan(supabase, prefill?.planId);

  return (
    <>
      <Header email={user.email} />
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-5 sm:p-8">
        <div>
          <Link
            href="/dashboard"
            className="text-sm text-muted hover:text-ink"
          >
            ← Back to dashboard
          </Link>
          <p className="mt-4 text-sm font-semibold uppercase tracking-[0.12em] text-rust">
            New entry
          </p>
          <h1 className="mt-2 font-serif text-4xl font-semibold tracking-tight">
            {prefill ? "Log planned workout" : "Log a workout"}
          </h1>
        </div>
        <WorkoutForm
          catalog={(exercises as CatalogExercise[]) ?? []}
          workoutTypes={workoutTypes ?? []}
          shoes={shoes}
          prefill={prefill}
          plan={plan}
        />
      </main>
    </>
  );
}
