"use client";

import { useState, useTransition } from "react";
import {
  METRIC_FIELDS,
  WORKOUT_TYPE_PRESETS,
  todayTitlePrefix,
  autoExerciseForType,
  type MeasurementType,
} from "@/lib/logging/metrics";
import { saveWorkout, type SavePayload } from "./actions";
import { Combobox } from "./Combobox";

export type CatalogExercise = {
  id: string;
  name: string;
  muscle_group: string | null;
  measurement_type: MeasurementType;
};

// A set-group row: display-unit metric values + a "sets" count (how many times).
type SetGroupRow = { count: string; metrics: Record<string, string> };

type DraftInstance = {
  uid: string;
  exercise: CatalogExercise;
  groups: SetGroupRow[];
  showOptional: boolean;
  autoAdded: boolean; // added automatically from the workout type
};

let uidCounter = 0;
const nextUid = () => `i${uidCounter++}`;

const newGroup = (): SetGroupRow => ({ count: "1", metrics: {} });

/** True if the user hasn't entered any metric data into an instance yet. */
const isEmptyInstance = (i: DraftInstance) =>
  i.groups.every((g) => Object.values(g.metrics).every((v) => v.trim() === ""));

export function NewWorkoutForm({ catalog }: { catalog: CatalogExercise[] }) {
  const [workoutType, setWorkoutType] = useState("");
  const [title, setTitle] = useState("");
  const [titleEdited, setTitleEdited] = useState(false);
  const [notes, setNotes] = useState("");
  const [instances, setInstances] = useState<DraftInstance[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const autoTitle = [todayTitlePrefix(), workoutType].filter(Boolean).join(" ");

  function makeInstance(exercise: CatalogExercise, autoAdded: boolean): DraftInstance {
    return {
      uid: nextUid(),
      exercise,
      groups: [newGroup()],
      showOptional: false,
      autoAdded,
    };
  }

  function chooseType(value: string) {
    setWorkoutType(value);
    if (!titleEdited) setTitle(value ? `${todayTitlePrefix()} ${value}` : "");

    // Auto-add the activity's exercise for single-activity types (Run → Running).
    const name = autoExerciseForType(value);
    const target = name
      ? catalog.find((e) => e.name.toLowerCase() === name.toLowerCase())
      : undefined;

    setInstances((prev) => {
      // Drop any prior auto-added instance the user never touched, so switching
      // Run → Bike swaps the exercise rather than piling them up.
      const kept = prev.filter((i) => !(i.autoAdded && isEmptyInstance(i)));
      if (!target) return kept;
      if (kept.some((i) => i.exercise.id === target.id)) return kept; // already present
      return [makeInstance(target, true), ...kept];
    });
  }

  function addExercise(exerciseId: string) {
    const exercise = catalog.find((e) => e.id === exerciseId);
    if (!exercise) return;
    setInstances((prev) => [...prev, makeInstance(exercise, false)]);
  }

  const patch = (uid: string, fn: (i: DraftInstance) => DraftInstance) =>
    setInstances((prev) => prev.map((i) => (i.uid === uid ? fn(i) : i)));

  const updateMetric = (uid: string, gi: number, key: string, value: string) =>
    patch(uid, (i) => ({
      ...i,
      groups: i.groups.map((g, j) =>
        j === gi ? { ...g, metrics: { ...g.metrics, [key]: value } } : g,
      ),
    }));

  const updateCount = (uid: string, gi: number, value: string) =>
    patch(uid, (i) => ({
      ...i,
      groups: i.groups.map((g, j) => (j === gi ? { ...g, count: value } : g)),
    }));

  const addGroup = (uid: string) =>
    patch(uid, (i) => ({ ...i, groups: [...i.groups, newGroup()] }));

  const removeGroup = (uid: string, gi: number) =>
    patch(uid, (i) => ({ ...i, groups: i.groups.filter((_, j) => j !== gi) }));

  const toggleOptional = (uid: string) =>
    patch(uid, (i) => ({ ...i, showOptional: !i.showOptional }));

  const removeInstance = (uid: string) =>
    setInstances((prev) => prev.filter((i) => i.uid !== uid));

  function handleSave() {
    setError(null);
    const payload: SavePayload = {
      title: title || undefined,
      workoutType: workoutType || undefined,
      notes: notes || undefined,
      instances: instances.map((inst) => ({
        exerciseId: inst.exercise.id,
        measurementType: inst.exercise.measurement_type,
        setGroups: inst.groups
          .map((g) => {
            const metrics: Record<string, number> = {};
            for (const [k, v] of Object.entries(g.metrics)) {
              if (v.trim() === "") continue;
              const n = Number(v);
              if (!Number.isNaN(n)) metrics[k] = n;
            }
            const count = Math.max(1, Math.floor(Number(g.count)) || 1);
            return { count, metrics };
          })
          .filter((g) => Object.keys(g.metrics).length > 0),
      })),
    };

    if (payload.instances.every((i) => i.setGroups.length === 0)) {
      setError("Add at least one exercise with a completed set.");
      return;
    }

    startTransition(async () => {
      const result = await saveWorkout(payload);
      if (result?.error) setError(result.error);
    });
  }

  const exerciseOptions = catalog.map((e) => ({
    value: e.id,
    label: e.name,
    hint: e.muscle_group ?? undefined,
  }));

  return (
    <div className="flex flex-col gap-6">
      {/* Workout type — searchable, free-text (note #1) */}
      <label className="block space-y-1">
        <span className="text-sm font-medium">Workout type</span>
        <Combobox
          options={WORKOUT_TYPE_PRESETS.map((t) => ({ value: t, label: t }))}
          placeholder="e.g. Run, Gym, Bike…"
          allowFreeText
          value={workoutType}
          onChange={chooseType}
        />
      </label>

      <label className="block space-y-1">
        <span className="text-sm font-medium">Title (optional)</span>
        <input
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            setTitleEdited(true);
          }}
          placeholder={autoTitle || "Auto-filled from date + type"}
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-900"
        />
      </label>

      {instances.map((inst) => (
        <InstanceCard
          key={inst.uid}
          instance={inst}
          onUpdateMetric={updateMetric}
          onUpdateCount={updateCount}
          onAddGroup={addGroup}
          onRemoveGroup={removeGroup}
          onToggleOptional={toggleOptional}
          onRemove={removeInstance}
        />
      ))}

      {/* Exercise picker — searchable, resets after each pick (note #1) */}
      <div className="space-y-1">
        <span className="text-sm font-medium">
          {instances.length > 0 ? "Add another exercise" : "Add exercise"}
        </span>
        <Combobox
          options={exerciseOptions}
          placeholder="Search exercises…"
          resetOnSelect
          onSelect={addExercise}
        />
      </div>

      {/* Workout-level notes (moved up from per-exercise to reduce clutter) */}
      <label className="block space-y-1">
        <span className="text-sm font-medium">Notes (optional)</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="How the session felt, conditions, anything worth remembering…"
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-900"
        />
      </label>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="sticky bottom-0 -mx-4 border-t border-zinc-200 bg-white/90 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-md sm:border dark:border-zinc-800 dark:bg-zinc-950/90">
        <button
          onClick={handleSave}
          disabled={isPending || instances.length === 0}
          className="w-full rounded-md bg-zinc-900 px-4 py-3 text-base font-medium text-white disabled:opacity-50 dark:bg-white dark:text-zinc-900"
        >
          {isPending ? "Saving…" : "Save workout"}
        </button>
      </div>
    </div>
  );
}

function InstanceCard({
  instance,
  onUpdateMetric,
  onUpdateCount,
  onAddGroup,
  onRemoveGroup,
  onToggleOptional,
  onRemove,
}: {
  instance: DraftInstance;
  onUpdateMetric: (uid: string, gi: number, key: string, value: string) => void;
  onUpdateCount: (uid: string, gi: number, value: string) => void;
  onAddGroup: (uid: string) => void;
  onRemoveGroup: (uid: string, gi: number) => void;
  onToggleOptional: (uid: string) => void;
  onRemove: (uid: string) => void;
}) {
  const allFields = METRIC_FIELDS[instance.exercise.measurement_type];
  const visibleFields = instance.showOptional
    ? allFields
    : allFields.filter((f) => !f.optional);
  const hasOptional = allFields.some((f) => f.optional);

  return (
    <section className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-medium">{instance.exercise.name}</h2>
        <button
          onClick={() => onRemove(instance.uid)}
          className="text-sm text-zinc-500 hover:text-red-600"
        >
          Remove
        </button>
      </div>

      <div className="space-y-2">
        {instance.groups.map((group, gi) => (
          <div key={gi} className="flex flex-wrap items-end gap-2">
            {visibleFields.map((field) => (
              <label key={field.key} className="flex-1 space-y-0.5">
                <span className="text-xs text-zinc-500">
                  {field.label}
                  {field.unit ? ` (${field.unit})` : ""}
                  {field.optional ? "" : " *"}
                </span>
                <input
                  type="number"
                  inputMode="decimal"
                  step={field.step}
                  value={group.metrics[field.key] ?? ""}
                  onChange={(e) =>
                    onUpdateMetric(instance.uid, gi, field.key, e.target.value)
                  }
                  className="w-full rounded-md border border-zinc-300 px-2 py-2 text-base dark:border-zinc-700 dark:bg-zinc-900"
                />
              </label>
            ))}
            {/* Sets count (note #2 → the screenshot fix) */}
            <label className="w-16 space-y-0.5">
              <span className="text-xs text-zinc-500">Sets</span>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                value={group.count}
                onChange={(e) => onUpdateCount(instance.uid, gi, e.target.value)}
                className="w-full rounded-md border border-zinc-300 px-2 py-2 text-base dark:border-zinc-700 dark:bg-zinc-900"
              />
            </label>
            {instance.groups.length > 1 && (
              <button
                onClick={() => onRemoveGroup(instance.uid, gi)}
                className="pb-2 text-sm text-zinc-400 hover:text-red-600"
                aria-label="Remove row"
                title="Remove row"
              >
                ✕
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="mt-3 flex gap-4">
        <button
          onClick={() => onAddGroup(instance.uid)}
          className="text-sm font-medium text-zinc-700 hover:underline dark:text-zinc-300"
        >
          + Add another set/row
        </button>
        {hasOptional && (
          <button
            onClick={() => onToggleOptional(instance.uid)}
            className="text-sm text-zinc-500 hover:underline"
          >
            {instance.showOptional ? "− Fewer fields" : "+ More fields"}
          </button>
        )}
      </div>
    </section>
  );
}
