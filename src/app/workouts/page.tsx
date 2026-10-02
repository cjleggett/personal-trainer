import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { METERS_PER_MILE } from "@/lib/logging/metrics";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** One-line summary of a session from its instances' generated summary cols. */
function summarize(
  instances: {
    total_distance_m: number | null;
    total_duration_s: number | null;
  }[],
): string {
  const count = instances.length;
  const distance = instances.reduce((s, i) => s + (i.total_distance_m ?? 0), 0);
  const duration = instances.reduce((s, i) => s + (i.total_duration_s ?? 0), 0);
  const bits: string[] = [`${count} exercise${count === 1 ? "" : "s"}`];
  if (distance > 0) bits.push(`${Math.round((distance / METERS_PER_MILE) * 100) / 100} mi`);
  if (duration > 0) bits.push(`${Math.round(duration / 60)} min`);
  return bits.join(" · ");
}

export default async function WorkoutsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: workouts } = await supabase
    .from("workouts")
    .select(
      "id, title, workout_type, performed_at, exercise_instances(total_distance_m, total_duration_s)",
    )
    .order("performed_at", { ascending: false });

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-4 sm:p-6">
      <Link href="/dashboard" className="text-sm text-zinc-500 hover:underline">
        ← Back to dashboard
      </Link>
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Workout history</h1>
        <Link
          href="/workouts/new"
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-white dark:text-zinc-900"
        >
          Log workout
        </Link>
      </header>

      {!workouts || workouts.length === 0 ? (
        <p className="text-zinc-500">
          No workouts logged yet.{" "}
          <Link href="/workouts/new" className="underline">
            Log your first one
          </Link>
          .
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {workouts.map((w) => (
            <li key={w.id}>
              <Link
                href={`/workouts/${w.id}`}
                className="block rounded-lg border border-zinc-200 p-4 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium">
                    {w.title || formatDate(w.performed_at)}
                  </span>
                  <span className="shrink-0 text-sm text-zinc-500">
                    {formatDate(w.performed_at)}
                  </span>
                </div>
                <p className="mt-1 text-sm text-zinc-500">
                  {summarize(w.exercise_instances)}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
