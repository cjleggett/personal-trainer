import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/app/Header";
import { METERS_PER_MILE } from "@/lib/logging/metrics";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** Month heading (e.g. "October 2026") used to group the history list. */
function monthLabel(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

/** A small emoji per workout type, matched loosely so free-text types still hit. */
function activityIcon(type: string | null): string {
  const t = (type ?? "").toLowerCase();
  if (t.includes("run")) return "🏃";
  if (t.includes("bike") || t.includes("cycl") || t.includes("spin")) return "🚴";
  if (t.includes("swim")) return "🏊";
  if (t.includes("hike") || t.includes("walk")) return "🥾";
  if (t.includes("yoga") || t.includes("stretch") || t.includes("mobility"))
    return "🧘";
  if (t.includes("roller") || t.includes("skate")) return "⛸️";
  if (t.includes("soccer") || t.includes("football")) return "⚽";
  if (t.includes("gym") || t.includes("strength") || t.includes("lift"))
    return "🏋️";
  return "💪";
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
  if (distance > 0)
    bits.push(`${Math.round((distance / METERS_PER_MILE) * 100) / 100} mi`);
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

  // Group the (already date-sorted) workouts under month headings.
  const groups: { month: string; items: NonNullable<typeof workouts> }[] = [];
  for (const w of workouts ?? []) {
    const month = monthLabel(w.performed_at);
    const last = groups[groups.length - 1];
    if (last && last.month === month) last.items.push(w);
    else groups.push({ month, items: [w] });
  }

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

        {!workouts || workouts.length === 0 ? (
          <p className="text-muted">
            No workouts logged yet.{" "}
            <Link href="/workouts/new" className="text-rust underline">
              Log your first one
            </Link>
            .
          </p>
        ) : (
          groups.map((group) => (
            <section key={group.month} className="flex flex-col gap-3">
              <h2 className="font-serif text-sm font-semibold uppercase tracking-[0.08em] text-faint">
                {group.month}
              </h2>
              <ul className="flex flex-col gap-3">
                {group.items.map((w) => (
                  <li key={w.id}>
                    <Link
                      href={`/workouts/${w.id}`}
                      className="flex items-center gap-4 rounded-2xl border border-line bg-surface p-5 transition-all hover:-translate-y-0.5 hover:border-line-strong hover:shadow-[0_6px_16px_rgba(43,38,32,0.08)]"
                    >
                      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-rust-soft text-xl">
                        {activityIcon(w.workout_type)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="font-serif text-lg font-semibold">
                          {w.title || formatDate(w.performed_at)}
                        </p>
                        <p className="mt-0.5 text-sm text-muted">
                          {summarize(w.exercise_instances)}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm text-faint">
                          {formatDate(w.performed_at)}
                        </p>
                        {w.workout_type && (
                          <p className="mt-1 text-xs font-semibold uppercase tracking-[0.06em] text-olive">
                            {w.workout_type}
                          </p>
                        )}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </main>
    </>
  );
}
