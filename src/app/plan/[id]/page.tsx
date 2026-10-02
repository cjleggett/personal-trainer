import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  trainingPlanSchema,
  type TrainingPlan,
  type PlanWeek,
} from "@/lib/ai/schemas";
import { dateForSlot } from "@/lib/logging/plan-dates";
import { DeletePlanButton } from "./DeletePlanButton";

function formatDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/**
 * At-a-glance week-by-week overview. Pivots each week's metrics into a table:
 * one row per week, one column per distinct metric label (union across weeks,
 * in first-seen order). The plan prompt asks the model to keep labels consistent
 * week to week, so columns line up and trends read down each column. Renders
 * nothing for older plans generated before metrics existed.
 */
function PlanOverview({ weeks }: { weeks: PlanWeek[] }) {
  const columns: string[] = [];
  for (const week of weeks) {
    for (const metric of week.metrics) {
      if (!columns.includes(metric.label)) columns.push(metric.label);
    }
  }
  if (columns.length === 0) return null;

  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">Overview</h2>
      <div className="overflow-x-auto rounded-md border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-left text-zinc-500 dark:border-zinc-800">
              <th className="px-4 py-2 font-medium">Week</th>
              {columns.map((label) => (
                <th key={label} className="px-4 py-2 font-medium">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {weeks.map((week) => {
              const byLabel = new Map(week.metrics.map((m) => [m.label, m.value]));
              return (
                <tr key={week.weekNumber}>
                  <th
                    scope="row"
                    className="whitespace-nowrap px-4 py-2 text-left font-medium"
                  >
                    {week.weekNumber}
                    <span className="ml-2 font-normal text-zinc-500">
                      {week.phase}
                    </span>
                  </th>
                  {columns.map((label) => (
                    <td
                      key={label}
                      className="px-4 py-2 text-zinc-600 dark:text-zinc-400"
                    >
                      {byLabel.get(label) ?? "—"}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default async function PlanDetailPage({
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

  const { data: row } = await supabase
    .from("training_plans")
    .select("name, start_date, target_date, plan")
    .eq("id", id)
    .single(); // RLS scopes to the owner
  if (!row) notFound();

  // Validate the stored JSONB back into the typed shape before rendering.
  const parsed = trainingPlanSchema.safeParse(row.plan);
  if (!parsed.success) {
    return (
      <main className="mx-auto w-full max-w-2xl flex-1 p-4 sm:p-6">
        <p className="text-sm text-red-600">This plan&apos;s data is malformed.</p>
      </main>
    );
  }
  const plan: TrainingPlan = parsed.data;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-4 sm:p-6">
      <header className="flex items-start justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">{row.name}</h1>
        <Link
          href="/dashboard"
          className="shrink-0 rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium dark:border-zinc-700"
        >
          Done
        </Link>
      </header>

      <p className="text-zinc-600 dark:text-zinc-400">{plan.summary}</p>
      <p className="text-sm text-zinc-500">
        Starts {formatDate(row.start_date)}
        {row.target_date ? ` · goal ${formatDate(row.target_date)}` : ""}
      </p>

      <PlanOverview weeks={plan.weeks} />

      <div className="flex flex-col gap-6">
        {plan.weeks.map((week) => (
          <section key={week.weekNumber} className="space-y-2">
            <div className="flex items-baseline justify-between">
              <h2 className="text-lg font-semibold">
                Week {week.weekNumber} · {week.phase}
              </h2>
            </div>
            <p className="text-sm text-zinc-500">{week.emphasis}</p>
            <ul className="divide-y divide-zinc-200 rounded-md border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
              {week.days.map((day, dayIdx) => {
                const date = dateForSlot(row.start_date, week.weekNumber, dayIdx);
                return (
                  <li
                    key={dayIdx}
                    className={`flex items-start justify-between gap-4 px-4 py-3 ${
                      day.isRestDay ? "text-zinc-400 dark:text-zinc-500" : ""
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        {formatDate(date)} · {day.focus}
                      </p>
                      <p className="text-sm text-zinc-500">{day.target}</p>
                      {day.exercises.length > 0 && (
                        <ul className="mt-1.5 space-y-0.5">
                          {day.exercises.map((ex, exIdx) => (
                            <li
                              key={exIdx}
                              className="flex justify-between gap-3 text-sm text-zinc-500"
                            >
                              <span>
                                {ex.name}
                                {ex.notes ? (
                                  <span className="text-zinc-400">
                                    {" "}
                                    — {ex.notes}
                                  </span>
                                ) : null}
                              </span>
                              {ex.target && (
                                <span className="shrink-0 text-zinc-400">
                                  {ex.target}
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      <div className="mt-2 flex justify-end border-t border-zinc-200 pt-4 dark:border-zinc-800">
        <DeletePlanButton planId={id} />
      </div>
    </main>
  );
}
