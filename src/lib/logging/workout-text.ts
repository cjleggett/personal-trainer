/**
 * Plain-text rendering of a workout, for the "Copy" buttons that let a user
 * lift a session out of the app (into notes, a message, a spreadsheet). The
 * shape is deliberately plain: a title line, then one entry per exercise,
 * each on its own line, e.g.
 *
 *   Lower-body strength
 *   Goblet Squat 3x10 moderate
 *   Lateral Step-down 3x10 per leg
 *
 * The same formatter serves every surface a prescribed workout shows up on
 * (dashboard "today", the plan timeline, a coach draft), so the copied text is
 * identical wherever it comes from. Logged workouts build their own entry lines
 * (collapsed sets) and reuse `workoutToPlainText` to assemble the block.
 */

/** Assemble a title and already-formatted exercise entries into the copyable
 * block: title first, then one entry per line. Empty pieces are dropped so a
 * titleless or exerciseless workout still reads clean. */
export function workoutToPlainText(title: string, entries: string[]): string {
  const parts = [title, ...entries].map((p) => p?.trim()).filter(Boolean);
  return parts.join("\n");
}

/** One prescribed/drafted exercise as a line: "Goblet Squat 3x10 moderate".
 * The target already carries the sets×reps and any intensity cue, so this is
 * just name + target with a single space between. */
export function prescribedExerciseLine(ex: {
  name: string;
  target?: string | null;
}): string {
  return [ex.name, ex.target].map((s) => s?.trim()).filter(Boolean).join(" ");
}

/**
 * The copyable text for a prescribed workout (a plan day or a coach draft):
 * title, then a line per exercise. For a single-activity day with no exercise
 * list (an easy run), the day's high-level target stands in as the one entry so
 * the copy still describes the session.
 */
export function prescribedWorkoutText(
  title: string,
  target: string | null | undefined,
  exercises: { name: string; target?: string | null }[],
): string {
  const entries =
    exercises.length > 0
      ? exercises.map(prescribedExerciseLine)
      : target
        ? [target]
        : [];
  return workoutToPlainText(title, entries);
}
