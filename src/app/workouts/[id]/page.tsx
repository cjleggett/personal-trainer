import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  collapseSets,
  formatSet,
  type MeasurementType,
  type StoredSet,
} from "@/lib/logging/metrics";

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function WorkoutDetailPage({
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

  // RLS scopes this to the current user; a stranger's id simply returns null.
  const { data: workout } = await supabase
    .from("workouts")
    .select(
      "id, title, workout_type, notes, performed_at, exercise_instances(id, position, sets, exercises(name, measurement_type))",
    )
    .eq("id", id)
    .single();

  if (!workout) notFound();

  const instances = [...workout.exercise_instances].sort(
    (a, b) => a.position - b.position,
  );

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-4 sm:p-6">
      <header className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {workout.title || "Workout"}
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            {workout.workout_type ? `${workout.workout_type} · ` : ""}
            {formatDateTime(workout.performed_at)}
          </p>
        </div>
        <Link
          href={`/workouts/${workout.id}/edit`}
          className="shrink-0 rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium dark:border-zinc-700"
        >
          Edit
        </Link>
      </header>

      <div className="flex flex-col gap-4">
        {instances.map((inst) => {
          const exercise = inst.exercises;
          const mt = exercise?.measurement_type as MeasurementType | undefined;
          const sets = (inst.sets as StoredSet[]) ?? [];
          const grouped = mt ? collapseSets(sets) : [];
          return (
            <section
              key={inst.id}
              className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
            >
              <h2 className="mb-2 font-medium">
                {exercise?.name ?? "Exercise"}
              </h2>
              <ul className="space-y-1 text-sm">
                {mt &&
                  grouped.map((g, i) => (
                    <li key={i} className="text-zinc-700 dark:text-zinc-300">
                      {g.count > 1 ? `${g.count} × ` : ""}
                      {formatSet(mt, g.set)}
                    </li>
                  ))}
              </ul>
            </section>
          );
        })}
      </div>

      {workout.notes && (
        <section className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <h2 className="mb-1 text-sm font-medium text-zinc-500">Notes</h2>
          <p className="whitespace-pre-wrap text-sm">{workout.notes}</p>
        </section>
      )}

      <Link href="/workouts" className="text-sm text-zinc-500 hover:underline">
        ← Back to history
      </Link>
    </main>
  );
}
