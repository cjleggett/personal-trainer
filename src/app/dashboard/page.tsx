import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/app/Header";
import { trainingPlanSchema } from "@/lib/ai/schemas";
import {
  addDays,
  dateForSlot,
  relativeDayLabel,
  todayInTimeZone,
  weekdayOf,
} from "@/lib/logging/plan-dates";
import { CoachChat } from "./CoachChat";
import { TimezoneSync } from "./TimezoneSync";

/** How many upcoming plan days to surface on the dashboard. */
const UPCOMING_COUNT = 4;

/** How many recently-passed plan days to also surface, so a user can log a
 * workout from the night before that they didn't get to until the morning. */
const RECENT_PAST_COUNT = 2;

/** A plan goes "stale" once it's gone this long without being changed or
 * reviewed; past this we nudge the athlete to re-evaluate it. */
const REEVALUATE_AFTER_DAYS = 7;

/** Whole days since the later of the plan's last change and last review. Null if
 * neither timestamp is usable. Drives the dashboard's re-evaluate nudge. */
function daysSinceReviewed(
  updatedAt: string | null,
  lastReevaluatedAt: string | null,
): number | null {
  const times = [updatedAt, lastReevaluatedAt]
    .map((t) => (t ? new Date(t).getTime() : NaN))
    .filter((t) => !Number.isNaN(t));
  if (times.length === 0) return null;
  const latest = Math.max(...times);
  return Math.floor((Date.now() - latest) / 86_400_000);
}

/** Sunday-based weekday index, to find the Monday that starts "this week". */
const SUNDAY_INDEX: Record<string, number> = {
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
};

/** The Monday on or before `today` (start of the current Mon→Sun week). */
function weekStartMonday(today: string): string {
  const dow = SUNDAY_INDEX[weekdayOf(today)];
  return addDays(today, -((dow + 6) % 7));
}

/** Format a timestamp to a YYYY-MM-DD calendar date in the user's zone. */
function localDate(ts: string, timeZone?: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date(ts));
  } catch {
    return new Date(ts).toISOString().slice(0, 10);
  }
}

type UpcomingDay = {
  date: string; // YYYY-MM-DD
  focus: string;
  target: string;
  exercises: { name: string; target: string; notes: string | null }[];
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
 * Flatten a validated plan into dated days within a window around `today` —
 * the last couple of days (so a late-logged workout from the night before is
 * reachable) through the next few — each with a human label. The plan's
 * `start_date` anchors the weekday-labeled skeleton to real calendar dates
 * (Week 1 Day 1 = start_date).
 */
function upcomingDays(
  plan: ReturnType<typeof trainingPlanSchema.parse>,
  startDate: string,
  today: string,
): UpcomingDay[] {
  const windowStart = addDays(today, -RECENT_PAST_COUNT);
  const days: UpcomingDay[] = [];
  for (const week of plan.weeks) {
    week.days.forEach((day, dayIdx) => {
      const date = dateForSlot(startDate, week.weekNumber, dayIdx);
      if (date < windowStart) return;
      days.push({
        date,
        focus: day.focus,
        target: day.target,
        exercises: day.exercises,
        isRestDay: day.isRestDay,
        phase: week.phase,
        label: relativeDayLabel(today, date) ?? formatDate(date),
      });
    });
  }
  days.sort((a, b) => a.date.localeCompare(b.date));
  // Keep the recent past days plus the upcoming ones; the past window is
  // bounded by `windowStart` above, so cap only the upcoming tail here.
  const firstUpcoming = days.findIndex((d) => d.date >= today);
  const start = firstUpcoming === -1 ? days.length : firstUpcoming;
  return days.slice(0, start + UPCOMING_COUNT);
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

  // "Today" in the user's own timezone. The browser records its IANA zone in a
  // `tz` cookie (see TimezoneSync); without it we fall back to the server zone
  // (UTC on Vercel), which TimezoneSync corrects with a one-time refresh.
  const timeZone = (await cookies()).get("tz")?.value;
  const today = todayInTimeZone(timeZone); // YYYY-MM-DD

  const [{ data: profile }, { data: planRow }] = await Promise.all([
    supabase
      .from("profiles")
      .select("display_name, goals, experience_level")
      .eq("id", user.id)
      .single(),
    supabase
      .from("training_plans")
      .select(
        "id, name, start_date, target_date, plan, updated_at, last_reevaluated_at",
      )
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

  // --- Dashboard stats ---------------------------------------------------
  // Two at-a-glance numbers, both derived from logged workouts over the last 30
  // days (a superset of "this week"), so a single query feeds both.
  const windowStart = addDays(today, -29); // inclusive 30-day window
  const { data: recentWorkouts } = await supabase
    .from("workouts")
    .select("performed_at")
    .gte("performed_at", `${windowStart}T00:00:00`)
    .order("performed_at", { ascending: false });

  const monday = weekStartMonday(today);
  const activeDates = new Set<string>();
  let sessionsThisWeek = 0;
  for (const w of recentWorkouts ?? []) {
    const d = localDate(w.performed_at, timeZone);
    activeDates.add(d); // dedupe multiple sessions on the same day
    if (d >= monday) sessionsThisWeek += 1;
  }
  const activeDays = activeDates.size;

  // Target sessions for the week come from the active plan's non-rest days this
  // calendar week, when a plan exists; otherwise fall back to a sensible 5.
  let weeklyTarget = 5;
  if (parsed?.success && planRow) {
    const sunday = addDays(monday, 6);
    let planned = 0;
    for (const week of parsed.data.weeks) {
      week.days.forEach((day, dayIdx) => {
        const date = dateForSlot(planRow.start_date, week.weekNumber, dayIdx);
        if (date >= monday && date <= sunday && !day.isRestDay) planned += 1;
      });
    }
    if (planned > 0) weeklyTarget = planned;
  }
  const sessionsRemaining = Math.max(0, weeklyTarget - sessionsThisWeek);

  const greetingName = profile?.display_name?.trim().split(/\s+/)[0];

  // Nudge the athlete to re-evaluate a plan that's gone untouched/unreviewed for
  // a week — real training drifts from the plan, and a periodic coach review
  // keeps it honest (and resets this clock).
  const staleDays =
    parsed?.success && planRow
      ? daysSinceReviewed(planRow.updated_at, planRow.last_reevaluated_at)
      : null;
  const showReevaluateNudge =
    staleDays !== null && staleDays >= REEVALUATE_AFTER_DAYS;

  return (
    <>
      <Header email={user.email} />
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-10 p-5 sm:p-8">
        <TimezoneSync serverToday={today} />

        <section>
          <h1 className="font-serif text-4xl font-semibold tracking-tight">
            {greetingName ? `Welcome back, ${greetingName}.` : "Welcome back."}
          </h1>
        </section>

        {/* Two at-a-glance stats */}
        <section className="grid gap-4 sm:grid-cols-2">
          <StatCard
            label="This week's sessions"
            value={String(sessionsThisWeek)}
            unit={`done · ${sessionsRemaining} to go`}
          >
            <div className="mt-3 flex gap-1.5">
              {Array.from({ length: weeklyTarget }).map((_, i) => (
                <span
                  key={i}
                  className={`h-1.5 flex-1 rounded-full ${
                    i < sessionsThisWeek ? "bg-good" : "bg-line-strong"
                  }`}
                />
              ))}
            </div>
          </StatCard>

          <StatCard label="Active days · last 30" value={String(activeDays)} unit="of 30">
            <div className="mt-3 grid grid-cols-[repeat(15,1fr)] gap-1">
              {Array.from({ length: 30 }).map((_, i) => {
                // Oldest day on the left, today on the right.
                const date = addDays(windowStart, i);
                const on = activeDates.has(date);
                return (
                  <span
                    key={i}
                    className={`aspect-square rounded-full ${
                      on ? "bg-olive" : "bg-line-strong"
                    }`}
                  />
                );
              })}
            </div>
          </StatCard>
        </section>

        {showReevaluateNudge && planRow && (
          <Link
            href={`/plan/${planRow.id}?reevaluate=1`}
            className="group flex items-center justify-between gap-4 rounded-2xl border border-rust/30 bg-rust-soft px-5 py-4"
          >
            <div className="min-w-0">
              <p className="font-serif text-base font-semibold text-ink">
                Time to check in on your plan
              </p>
              <p className="mt-0.5 text-sm text-muted">
                It&apos;s been {staleDays} days since your plan last changed. Let
                your coach review your progress and adjust it.
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-rust px-4 py-1.5 text-sm font-medium text-on-rust">
              Re-evaluate
            </span>
          </Link>
        )}

        <CoachChat userId={user.id} />

        {parsed?.success && planRow && (
          <section className="flex flex-col gap-4">
            <h2 className="flex items-baseline gap-3 font-serif text-2xl font-semibold">
              The week ahead
              <Link
                href={`/plan/${planRow.id}`}
                className="text-sm font-normal text-faint hover:text-ink hover:underline"
              >
                {planRow.name}
              </Link>
            </h2>
            {upcoming.length > 0 ? (
              <ol className="flex flex-col border-l-2 border-line pl-6">
                {upcoming.map((day) => {
                  const done = loggedDays.has(day.date);
                  const logHref =
                    `/workouts/new?plan=${planRow.id}&day=${day.date}` +
                    `&focus=${encodeURIComponent(day.focus)}` +
                    `&target=${encodeURIComponent(day.target)}` +
                    // A gym day's prescribed exercises seed one logging card each.
                    (day.exercises.length > 0
                      ? `&exercises=${encodeURIComponent(JSON.stringify(day.exercises))}`
                      : "");
                  // Timeline dot color: logged → good, rest → faint, else rust.
                  const dot = done
                    ? "bg-good"
                    : day.isRestDay
                      ? "bg-faint"
                      : "bg-rust";
                  return (
                    <li
                      key={day.date}
                      className={`relative flex items-start justify-between gap-4 border-b border-line py-4 last:border-b-0 ${
                        day.isRestDay ? "opacity-60" : ""
                      }`}
                    >
                      <span
                        aria-hidden
                        className={`absolute -left-[1.9rem] top-6 size-[11px] rounded-full border-2 border-paper ${dot}`}
                      />
                      <div className="min-w-0">
                        <p className="font-serif text-sm font-semibold">
                          {day.label}
                        </p>
                        <p className="mt-0.5 font-medium">
                          {day.isRestDay ? "Rest day" : day.focus}
                        </p>
                        {!day.isRestDay && (
                          <p className="text-sm text-muted">{day.target}</p>
                        )}
                        {!day.isRestDay && day.exercises.length > 0 && (
                          // Collapsed by default so detailed gym days stay compact.
                          // Native <details> keeps this a server component (no JS).
                          <details className="group mt-2">
                            <summary className="flex cursor-pointer list-none items-center gap-1 text-sm text-faint hover:text-muted">
                              <span
                                aria-hidden
                                className="inline-block transition-transform group-open:rotate-90"
                              >
                                ▸
                              </span>
                              {day.exercises.length}{" "}
                              {day.exercises.length === 1
                                ? "exercise"
                                : "exercises"}
                            </summary>
                            <ul className="mt-1 space-y-0.5">
                              {day.exercises.map((ex, i) => (
                                <li
                                  key={i}
                                  className="flex justify-between gap-3 text-sm text-muted"
                                >
                                  <span className="truncate">{ex.name}</span>
                                  {ex.target && (
                                    <span className="shrink-0 text-faint">
                                      {ex.target}
                                    </span>
                                  )}
                                </li>
                              ))}
                            </ul>
                          </details>
                        )}
                        <p className="mt-1 font-serif text-xs italic text-faint">
                          {day.phase} phase
                        </p>
                      </div>
                      {!day.isRestDay && (
                        <div className="shrink-0">
                          {done ? (
                            <span className="inline-flex items-center gap-1 font-serif text-sm font-semibold text-good">
                              <span aria-hidden>✓</span> Logged
                            </span>
                          ) : (
                            <Link
                              href={logHref}
                              className="inline-flex items-center rounded-full border border-line-strong bg-surface px-4 py-1.5 text-sm font-medium"
                            >
                              Log
                            </Link>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>
            ) : (
              <p className="text-sm text-muted">
                This plan has no upcoming days — it may have finished.
              </p>
            )}
          </section>
        )}

        {!parsed?.success && (
          <section className="rounded-2xl border border-dashed border-line-strong p-6 text-center">
            <p className="text-muted">
              No active plan yet. Plan generation and daily workouts build on the
              goal you set.
            </p>
            <Link
              href="/plan"
              className="mt-3 inline-flex items-center rounded-full bg-rust px-5 py-2 text-sm font-medium text-on-rust"
            >
              Start a training plan
            </Link>
          </section>
        )}
      </main>
    </>
  );
}

/** A labeled stat tile with a big serif number and optional visual below. */
function StatCard({
  label,
  value,
  unit,
  children,
}: {
  label: string;
  value: string;
  unit?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-6 shadow-[0_2px_10px_rgba(43,38,32,0.04)]">
      <p className="text-sm font-semibold uppercase tracking-[0.09em] text-faint">
        {label}
      </p>
      <p className="mt-1 font-serif text-4xl font-semibold leading-none tracking-tight">
        {value}
        {unit && (
          <span className="ml-1.5 font-sans text-base font-medium text-muted">
            {unit}
          </span>
        )}
      </p>
      {children}
    </div>
  );
}
