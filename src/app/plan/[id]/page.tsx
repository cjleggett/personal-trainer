import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/app/Header";
import {
  trainingPlanSchema,
  type TrainingPlan,
  type PlanWeek,
} from "@/lib/ai/schemas";
import { dateForSlot } from "@/lib/logging/plan-dates";
import { DeletePlanButton } from "./DeletePlanButton";
import { EditPlanChat } from "./EditPlanChat";

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
    <section className="space-y-3">
      <h2 className="font-serif text-2xl font-semibold">Overview</h2>
      <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-faint">
              <th className="px-4 py-2.5 font-medium">Week</th>
              {columns.map((label) => (
                <th key={label} className="px-4 py-2.5 font-medium">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {weeks.map((week) => {
              const byLabel = new Map(week.metrics.map((m) => [m.label, m.value]));
              return (
                <tr key={week.weekNumber}>
                  <th
                    scope="row"
                    className="whitespace-nowrap px-4 py-2.5 text-left font-medium"
                  >
                    {week.weekNumber}
                    <span className="ml-2 font-serif font-normal italic text-faint">
                      {week.phase}
                    </span>
                  </th>
                  {columns.map((label) => (
                    <td key={label} className="px-4 py-2.5 text-muted">
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
      <>
        <Header email={user.email} />
        <main className="mx-auto w-full max-w-2xl flex-1 p-5 sm:p-8">
          <p className="text-sm text-rust">This plan&apos;s data is malformed.</p>
        </main>
      </>
    );
  }
  const plan: TrainingPlan = parsed.data;

  return (
    <>
      <Header email={user.email} />
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-5 sm:p-8">
        <Link href="/dashboard" className="text-sm text-muted hover:text-ink">
          ← Back to dashboard
        </Link>

        <header>
          <p className="text-sm font-semibold uppercase tracking-[0.12em] text-rust">
            Training plan
          </p>
          <h1 className="mt-2 font-serif text-4xl font-semibold tracking-tight">
            {row.name}
          </h1>
          <p className="mt-3 text-muted">{plan.summary}</p>
          <p className="mt-1 text-sm text-faint">
            Starts {formatDate(row.start_date)}
            {row.target_date ? ` · goal ${formatDate(row.target_date)}` : ""}
          </p>
        </header>

        <EditPlanChat planId={id} userId={user.id} />

        <PlanOverview weeks={plan.weeks} />

        <div className="flex flex-col gap-8">
          {plan.weeks.map((week) => (
            <section key={week.weekNumber} className="space-y-3">
              <div>
                <h2 className="font-serif text-2xl font-semibold">
                  Week {week.weekNumber}{" "}
                  <span className="italic text-faint">· {week.phase}</span>
                </h2>
                <p className="mt-0.5 text-sm text-muted">{week.emphasis}</p>
              </div>
              <ol className="flex flex-col border-l-2 border-line pl-6">
                {week.days.map((day, dayIdx) => {
                  const date = dateForSlot(
                    row.start_date,
                    week.weekNumber,
                    dayIdx,
                  );
                  return (
                    <li
                      key={dayIdx}
                      className={`relative border-b border-line py-3 last:border-b-0 ${
                        day.isRestDay ? "opacity-60" : ""
                      }`}
                    >
                      <span
                        aria-hidden
                        className={`absolute -left-[1.9rem] top-5 size-[11px] rounded-full border-2 border-paper ${
                          day.isRestDay ? "bg-faint" : "bg-rust"
                        }`}
                      />
                      <p className="text-sm font-medium">
                        <span className="font-serif">{formatDate(date)}</span> ·{" "}
                        {day.focus}
                      </p>
                      {day.target && (
                        <p className="text-sm text-muted">{day.target}</p>
                      )}
                      {day.exercises.length > 0 && (
                        <ul className="mt-1.5 space-y-0.5">
                          {day.exercises.map((ex, exIdx) => (
                            <li
                              key={exIdx}
                              className="flex justify-between gap-3 text-sm text-muted"
                            >
                              <span>
                                {ex.name}
                                {ex.notes ? (
                                  <span className="text-faint"> — {ex.notes}</span>
                                ) : null}
                              </span>
                              {ex.target && (
                                <span className="shrink-0 text-faint">
                                  {ex.target}
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
        </div>

        <div className="mt-2 flex justify-end border-t border-line pt-4">
          <DeletePlanButton planId={id} />
        </div>
      </main>
    </>
  );
}
