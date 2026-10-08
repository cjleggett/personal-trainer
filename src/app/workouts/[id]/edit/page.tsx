import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/app/Header";
import {
  METRIC_FIELDS,
  collapseSets,
  type MeasurementType,
  type StoredSet,
} from "@/lib/logging/metrics";
import {
  WorkoutForm,
  type CatalogExercise,
  type InitialWorkout,
} from "../../WorkoutForm";
import { listShoesWithMileage } from "@/lib/logging/shoes";
import { loadLinkablePlan } from "@/lib/logging/plans";

/** Stored canonical value → display-unit string, inverting the save factor. */
function toDisplay(mt: MeasurementType, set: StoredSet): Record<string, string> {
  const out: Record<string, string> = {};
  for (const field of METRIC_FIELDS[mt]) {
    const raw = set[field.key];
    if (raw === undefined || raw === null) continue;
    const value = field.factor ? raw / field.factor : raw;
    out[field.key] = String(Math.round(value * 100) / 100);
  }
  return out;
}

/** ISO timestamp → YYYY-MM-DD in local time (for the date input). */
function toDateInput(iso: string): string {
  const d = new Date(iso);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export default async function EditWorkoutPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: workout }, { data: exercises }, { data: workoutTypes }, shoes] =
    await Promise.all([
      supabase
        .from("workouts")
        .select(
          "id, title, workout_type_id, notes, performed_at, duration_s, shoe_id, plan_id, plan_day_date, exercise_instances(position, sets, exercise_id, exercises(measurement_type))",
        )
        .eq("id", id)
        .single(),
      supabase
        .from("exercises")
        .select("id, name, muscle_group, measurement_type")
        .order("name"),
      supabase.from("workout_types").select("id, name, emoji").order("name"),
      listShoesWithMileage(supabase, user.id),
    ]);

  if (!workout) notFound();

  // Offer the plan to link against: the workout's linked plan if it has one
  // (even if archived), else the active plan so a prior ad-hoc entry can be
  // linked. Runs after the workout fetch since it depends on its plan_id.
  const plan = await loadLinkablePlan(supabase, workout.plan_id);

  const initial: InitialWorkout = {
    id: workout.id,
    title: workout.title ?? "",
    workoutTypeId: workout.workout_type_id ?? null,
    notes: workout.notes ?? "",
    performedOn: toDateInput(workout.performed_at),
    durationS: workout.duration_s ?? null,
    shoeId: workout.shoe_id ?? null,
    planDayDate: workout.plan_day_date ?? null,
    instances: [...workout.exercise_instances]
      .sort((a, b) => a.position - b.position)
      .map((inst) => {
        const mt = inst.exercises?.measurement_type as MeasurementType;
        const grouped = collapseSets((inst.sets as StoredSet[]) ?? []);
        return {
          exerciseId: inst.exercise_id,
          groups: grouped.map((g) => ({
            count: String(g.count),
            metrics: toDisplay(mt, g.set),
          })),
        };
      }),
  };

  return (
    <>
      <Header email={user.email} />
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-5 sm:p-8">
        <div>
          <Link
            href={`/workouts/${workout.id}`}
            className="text-sm text-muted hover:text-ink"
          >
            ← Back to workout
          </Link>
          <h1 className="mt-4 font-serif text-4xl font-semibold tracking-tight">
            Edit workout
          </h1>
        </div>
        <WorkoutForm
          catalog={(exercises as CatalogExercise[]) ?? []}
          workoutTypes={workoutTypes ?? []}
          shoes={shoes}
          initial={initial}
          plan={plan}
        />
      </main>
    </>
  );
}
