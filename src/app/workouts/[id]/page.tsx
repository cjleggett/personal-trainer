import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/app/Header";
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

/** A YYYY-MM-DD plan day as a short, TZ-stable label (e.g. "Oct 6"). */
function formatPlanDay(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
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
      "id, title, notes, performed_at, plan_id, plan_day_date, workout_types(name, emoji), shoes(name), training_plans(name), exercise_instances(id, position, sets, exercises(name, measurement_type))",
    )
    .eq("id", id)
    .single();

  if (!workout) notFound();

  const planName = (workout.training_plans as { name: string } | null)?.name;
  const planLink =
    workout.plan_id && workout.plan_day_date && planName
      ? { planId: workout.plan_id, name: planName, day: workout.plan_day_date }
      : null;

  const type = workout.workout_types as { name: string; emoji: string } | null;
  const shoeName = (workout.shoes as { name: string } | null)?.name ?? null;
  const instances = [...workout.exercise_instances].sort(
    (a, b) => a.position - b.position,
  );

  return (
    <>
      <Header email={user.email} />
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-5 sm:p-8">
        <Link href="/workouts" className="text-sm text-muted hover:text-ink">
          ← Back to history
        </Link>

        <header className="flex items-start justify-between gap-2">
          <div>
            <h1 className="font-serif text-4xl font-semibold tracking-tight">
              {workout.title || "Workout"}
            </h1>
            <p className="mt-2 text-sm text-muted">
              {type ? `${type.emoji} ${type.name} · ` : ""}
              {formatDateTime(workout.performed_at)}
              {shoeName ? ` · 👟 ${shoeName}` : ""}
            </p>
            {planLink && (
              <p className="mt-1 text-sm text-muted">
                📋 Fulfills the{" "}
                <Link
                  href={`/plan/${planLink.planId}`}
                  className="text-rust hover:underline"
                >
                  {formatPlanDay(planLink.day)} {planLink.name}
                </Link>{" "}
                plan day
              </p>
            )}
          </div>
          <Link
            href={`/workouts/${workout.id}/edit`}
            className="shrink-0 rounded-full border border-line-strong bg-surface px-4 py-1.5 text-sm font-medium"
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
                className="rounded-2xl border border-line bg-surface p-5"
              >
                <h2 className="mb-2 font-serif text-lg font-semibold">
                  {exercise?.name ?? "Exercise"}
                </h2>
                <ul className="space-y-1 text-sm">
                  {mt &&
                    grouped.map((g, i) => (
                      <li key={i} className="text-muted">
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
          <section className="rounded-2xl border border-line bg-surface p-5">
            <h2 className="mb-1 text-sm font-semibold text-faint">Notes</h2>
            <p className="whitespace-pre-wrap text-sm">{workout.notes}</p>
          </section>
        )}
      </main>
    </>
  );
}
