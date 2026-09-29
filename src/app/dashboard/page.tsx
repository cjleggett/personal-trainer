import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { signout } from "@/app/login/actions";
import { trainingPlanSchema } from "@/lib/ai/schemas";
import { dateForSlot, relativeDayLabel } from "@/lib/logging/plan-dates";
import { CoachChat } from "./CoachChat";

/** How many upcoming plan days to surface on the dashboard. */
const UPCOMING_COUNT = 4;

type UpcomingDay = {
  date: string; // YYYY-MM-DD
  focus: string;
  target: string;
  isRestDay: boolean;
  phase: string;
  label: string; // "Today", "Tomorrow", or a weekday/date
};

function formatDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/**
 * Flatten a validated plan into dated days, keep those on/after `today`, and
 * return the next few with a human label. The plan's `start_date` (a Monday)
 * anchors the weekday-labeled skeleton to real calendar dates.
 */
function upcomingDays(
  plan: ReturnType<typeof trainingPlanSchema.parse>,
  startDate: string,
  today: string,
): UpcomingDay[] {
  const days: UpcomingDay[] = [];
  for (const week of plan.weeks) {
    week.days.forEach((day, dayIdx) => {
      const date = dateForSlot(startDate, week.weekNumber, dayIdx);
      if (date < today) return;
      days.push({
        date,
        focus: day.focus,
        target: day.target,
        isRestDay: day.isRestDay,
        phase: week.phase,
        label: relativeDayLabel(today, date) ?? formatDate(date),
      });
    });
  }
  return days.sort((a, b) => a.date.localeCompare(b.date)).slice(0, UPCOMING_COUNT);
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // The proxy already gates this route, but re-check here as defense in depth.
  if (!user) {
    redirect("/login");
  }

  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  const [{ data: profile }, { data: planRow }] = await Promise.all([
    supabase
      .from("profiles")
      .select("display_name, goals, experience_level")
      .eq("id", user.id)
      .single(),
    supabase
      .from("training_plans")
      .select("id, name, start_date, target_date, plan")
      .eq("status", "active")
      .order("start_date", { ascending: false })
      .limit(1)
      .maybeSingle(), // RLS scopes to the owner
  ]);

  // Validate the stored JSONB before trusting it; skip the section if malformed.
  const parsed = planRow ? trainingPlanSchema.safeParse(planRow.plan) : null;
  const upcoming =
    parsed?.success && planRow
      ? upcomingDays(parsed.data, planRow.start_date, today)
      : [];

  // Which upcoming plan days have already been logged? A workout linked to this
  // plan via `plan_day_date` checks that day off.
  const loggedDays = new Set<string>();
  if (planRow && upcoming.length > 0) {
    const { data: logged } = await supabase
      .from("workouts")
      .select("plan_day_date")
      .eq("plan_id", planRow.id)
      .not("plan_day_date", "is", null);
    for (const w of logged ?? []) {
      if (w.plan_day_date) loggedDays.add(w.plan_day_date);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <form action={signout}>
          <button
            type="submit"
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium dark:border-zinc-700"
          >
            Sign out
          </button>
        </form>
      </header>

      <p className="text-zinc-600 dark:text-zinc-400">
        Signed in as <span className="font-medium">{user.email}</span>
        {profile?.display_name ? ` (${profile.display_name})` : ""}.
      </p>

      <CoachChat />

      {parsed?.success && planRow && (
        <section className="space-y-3">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="text-lg font-semibold">{planRow.name}</h2>
            <Link
              href={`/plan/${planRow.id}`}
              className="shrink-0 text-sm text-zinc-500 hover:underline"
            >
              View plan
            </Link>
          </div>
          {upcoming.length > 0 ? (
            <ul className="flex flex-col gap-3">
              {upcoming.map((day) => {
                const done = loggedDays.has(day.date);
                const logHref =
                  `/workouts/new?plan=${planRow.id}&day=${day.date}` +
                  `&focus=${encodeURIComponent(day.focus)}` +
                  `&target=${encodeURIComponent(day.target)}`;
                return (
                  <li
                    key={day.date}
                    className={`flex items-start justify-between gap-4 rounded-md border p-4 ${
                      done
                        ? "border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30"
                        : "border-zinc-200 dark:border-zinc-800"
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                        {day.label === "Today" || day.label === "Tomorrow"
                          ? `${day.label}'s workout`
                          : day.label}
                      </p>
                      <p className="mt-1 font-medium">
                        {day.isRestDay ? "Rest" : day.focus}
                      </p>
                      {!day.isRestDay && (
                        <p className="text-sm text-zinc-600 dark:text-zinc-400">
                          {day.target}
                        </p>
                      )}
                      <p className="mt-2 text-xs text-zinc-400">{day.phase}</p>
                    </div>
                    {!day.isRestDay && (
                      <div className="shrink-0">
                        {done ? (
                          <span className="inline-flex items-center gap-1 text-sm font-medium text-green-700 dark:text-green-400">
                            <span aria-hidden>✓</span> Logged
                          </span>
                        ) : (
                          <Link
                            href={logHref}
                            className="inline-flex items-center rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-white dark:text-zinc-900"
                          >
                            Log this workout
                          </Link>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-zinc-500">
              This plan has no upcoming days — it may have finished.
            </p>
          )}
        </section>
      )}

      <div className="flex flex-wrap gap-3">
        <Link
          href="/workouts/new"
          className="inline-flex w-fit items-center rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-zinc-900"
        >
          Log a workout
        </Link>
        <Link
          href="/workouts"
          className="inline-flex w-fit items-center rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium dark:border-zinc-700"
        >
          View history
        </Link>
        <Link
          href="/plan"
          className="inline-flex w-fit items-center rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium dark:border-zinc-700"
        >
          {parsed?.success ? "New plan" : "New training plan"}
        </Link>
      </div>

      {!parsed?.success && (
        <p className="text-sm text-zinc-500">
          Plan generation and daily workouts build on the goal you set here.
        </p>
      )}
    </main>
  );
}
