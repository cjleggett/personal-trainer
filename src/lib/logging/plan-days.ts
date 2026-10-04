/**
 * Flatten a validated training plan into a flat, dated list of days. The plan's
 * `start_date` anchors the weekday-labeled skeleton to real calendar dates (Week
 * 1 Day 1 = start_date), via the pure date math in `plan-dates.ts`. Used wherever
 * we need to enumerate a plan's days (e.g. the link-to-plan-day picker).
 */
import type { TrainingPlan } from "@/lib/ai/schemas";
import { dateForSlot } from "./plan-dates";

export type PlanDay = {
  date: string; // YYYY-MM-DD
  focus: string;
  target: string;
  isRestDay: boolean;
  phase: string;
  weekNumber: number;
};

/** All days of the plan as dated entries, ascending by date. */
export function flattenPlanDays(
  plan: TrainingPlan,
  startDate: string,
): PlanDay[] {
  const days: PlanDay[] = [];
  for (const week of plan.weeks) {
    week.days.forEach((day, dayIdx) => {
      days.push({
        date: dateForSlot(startDate, week.weekNumber, dayIdx),
        focus: day.focus,
        target: day.target,
        isRestDay: day.isRestDay,
        phase: week.phase,
        weekNumber: week.weekNumber,
      });
    });
  }
  days.sort((a, b) => a.date.localeCompare(b.date));
  return days;
}
