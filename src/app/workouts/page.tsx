import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/app/Header";
import { METERS_PER_MILE, DEFAULT_WORKOUT_EMOJI } from "@/lib/logging/metrics";
import { WorkoutsTable, type WorkoutRow } from "./WorkoutsTable";

export default async function WorkoutsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: workouts } = await supabase
    .from("workouts")
    .select(
      "id, title, performed_at, workout_types(name, emoji), exercise_instances(total_distance_m, total_duration_s)",
    )
    .order("performed_at", { ascending: false });

  const rows: WorkoutRow[] = (workouts ?? []).map((w) => {
    const meters = w.exercise_instances.reduce(
      (s, i) => s + (i.total_distance_m ?? 0),
      0,
    );
    const seconds = w.exercise_instances.reduce(
      (s, i) => s + (i.total_duration_s ?? 0),
      0,
    );
    const type = w.workout_types as { name: string; emoji: string } | null;
    return {
      id: w.id,
      title: w.title,
      workout_type: type?.name ?? null,
      emoji: type?.emoji ?? DEFAULT_WORKOUT_EMOJI,
      performed_at: w.performed_at,
      miles: meters / METERS_PER_MILE,
      seconds,
    };
  });

  return (
    <>
      <Header email={user.email} />
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-5 sm:p-8">
        <section>
          <p className="text-sm font-semibold uppercase tracking-[0.12em] text-rust">
            Your log
          </p>
          <h1 className="mt-2 font-serif text-4xl font-semibold tracking-tight">
            Workout history
          </h1>
        </section>

        {rows.length === 0 ? (
          <p className="text-muted">
            No workouts logged yet.{" "}
            <Link href="/workouts/new" className="text-rust underline">
              Log your first one
            </Link>
            .
          </p>
        ) : (
          <WorkoutsTable rows={rows} />
        )}
      </main>
    </>
  );
}
