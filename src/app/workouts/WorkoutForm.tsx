"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  METRIC_FIELDS,
  todayTitlePrefix,
  autoExerciseForType,
  parseTargetToMetrics,
  minutesToMinSec,
  minSecToMinutes,
  isRunningType,
  type MeasurementType,
  type MetricField,
} from "@/lib/logging/metrics";
import {
  createWorkout,
  updateWorkout,
  deleteWorkout,
  createWorkoutType,
  type SavePayload,
  type WorkoutTypeOption,
} from "./actions";
import { Combobox } from "./Combobox";
import { EmojiPicker } from "./EmojiPicker";

export type CatalogExercise = {
  id: string;
  name: string;
  muscle_group: string | null;
  measurement_type: MeasurementType;
};

export type { WorkoutTypeOption };

/** A pair of running shoes the user can attach to a run, with current mileage. */
export type ShoeOption = {
  id: string;
  name: string;
  distanceMi: number;
};

// For edit mode: the existing workout reshaped into the form's draft model.
export type InitialWorkout = {
  id: string;
  title: string;
  workoutTypeId: string | null;
  notes: string;
  performedOn: string; // YYYY-MM-DD
  shoeId: string | null; // currently-attached pair, if any
  instances: {
    exerciseId: string;
    groups: { count: string; metrics: Record<string, string> }[];
  }[];
};

// For create mode: seed a fresh draft (e.g. from a training-plan day). Unlike
// `initial`, this does NOT put the form in edit mode — it just prefills fields
// and carries the plan link through to the saved workout.
export type PrefillWorkout = {
  title?: string;
  workoutType?: string;
  /** The plan day's high-level target (e.g. "8 mi @ easy"); parsed to seed sets. */
  target?: string;
  /** Specific exercises to seed as cards (from the coach's drafted gym day). Each
   * is matched to the catalog by name; its `target` seeds that card's sets. */
  exercises?: { name: string; target?: string; notes?: string }[];
  planId?: string;
  planDayDate?: string; // YYYY-MM-DD
};

type SetGroupRow = { count: string; metrics: Record<string, string> };

type DraftInstance = {
  uid: string;
  exercise: CatalogExercise;
  groups: SetGroupRow[];
  showOptional: boolean;
  autoAdded: boolean;
};

let uidCounter = 0;
const nextUid = () => `i${uidCounter++}`;
const newGroup = (): SetGroupRow => ({ count: "1", metrics: {} });

const isEmptyInstance = (i: DraftInstance) =>
  i.groups.every((g) => Object.values(g.metrics).every((v) => v.trim() === ""));

function todayIso(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export function WorkoutForm({
  catalog,
  workoutTypes,
  shoes = [],
  initial,
  prefill,
}: {
  catalog: CatalogExercise[];
  workoutTypes: WorkoutTypeOption[];
  shoes?: ShoeOption[];
  initial?: InitialWorkout;
  prefill?: PrefillWorkout;
}) {
  const router = useRouter();
  const editing = !!initial;

  // The type catalog, held in state so a type added via "+ Add new type…" shows
  // up immediately. Resolve the seed id: edit mode uses the stored id; a prefill
  // carries a type NAME (from the coach/plan) we match against the catalog.
  const [types, setTypes] = useState<WorkoutTypeOption[]>(workoutTypes);
  const seedTypeId =
    initial?.workoutTypeId ??
    (prefill?.workoutType
      ? workoutTypes.find(
          (t) => t.name.toLowerCase() === prefill.workoutType!.trim().toLowerCase(),
        )?.id ?? null
      : null);
  const seedTitle =
    initial?.title ??
    prefill?.title ??
    "";

  const [workoutTypeId, setWorkoutTypeId] = useState<string | null>(seedTypeId);
  const [title, setTitle] = useState(seedTitle);
  const [titleEdited, setTitleEdited] = useState(!!seedTitle);
  // Notes are the user's own space (how they felt, conditions). We never seed it
  // from a prefill (coach draft / plan target) — only an existing workout's own
  // notes populate it, when editing.
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [performedOn, setPerformedOn] = useState(
    initial?.performedOn ?? todayIso(),
  );

  // Shoes (running workouts only). `shoeId` is the chosen existing pair ("" =
  // none). When adding a new pair, `shoeId` is "__new__" and the name/starting
  // mileage inputs appear. Seeded from the edited workout's attached pair.
  const NEW_SHOE = "__new__";
  const [shoeId, setShoeId] = useState<string>(initial?.shoeId ?? "");
  const [newShoeName, setNewShoeName] = useState("");
  const [newShoeStartMi, setNewShoeStartMi] = useState("");
  const [instances, setInstances] = useState<DraftInstance[]>(() => {
    if (initial) {
      return initial.instances.flatMap((si) => {
        const exercise = catalog.find((e) => e.id === si.exerciseId);
        if (!exercise) return [];
        return [
          {
            uid: nextUid(),
            exercise,
            groups: si.groups.length ? si.groups : [newGroup()],
            showOptional: false,
            autoAdded: false,
          },
        ];
      });
    }
    // Build a draft card for an exercise, seeding its first set from a target.
    const seedInstance = (
      exercise: CatalogExercise,
      target?: string,
    ): DraftInstance => {
      const parsed = target
        ? parseTargetToMetrics(exercise.measurement_type, target)
        : null;
      const group: SetGroupRow = parsed
        ? { count: parsed.count ?? "1", metrics: parsed.metrics }
        : newGroup();
      return {
        uid: nextUid(),
        exercise,
        groups: [group],
        showOptional: false,
        autoAdded: true,
      };
    };

    // Coach-drafted gym day: one card per prescribed exercise, matched to the
    // catalog by name, each seeded from its own target. Exercises the coach
    // named but that aren't in the catalog are skipped (should be rare — the
    // coach is told to create_exercise first).
    if (prefill?.exercises?.length) {
      const seeded = prefill.exercises.flatMap((ex) => {
        const exercise = catalog.find(
          (e) => e.name.toLowerCase() === ex.name.trim().toLowerCase(),
        );
        return exercise ? [seedInstance(exercise, ex.target)] : [];
      });
      if (seeded.length) return seeded;
      // Fall through to the single-activity seed if none matched.
    }

    // Create mode: seed the auto-add exercise for a single-activity prefill type
    // (e.g. a "Run" plan day), mirroring what chooseType does interactively.
    const name = prefill?.workoutType
      ? autoExerciseForType(prefill.workoutType)
      : null;
    const exercise = name
      ? catalog.find((e) => e.name.toLowerCase() === name.toLowerCase())
      : undefined;
    if (!exercise) return [];
    return [seedInstance(exercise, prefill?.target)];
  });
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Adding a new workout type inline: "__new__" selected in the picker reveals a
  // name input + emoji grid, mirroring the shoes "+ Add new…" pattern below.
  const NEW_TYPE = "__new__";
  const [addingType, setAddingType] = useState(false);
  const [newTypeName, setNewTypeName] = useState("");
  const [newTypeEmoji, setNewTypeEmoji] = useState("");
  const [typePending, startTypeTransition] = useTransition();

  // The selected type's name drives the title autofill, auto-add exercise, and
  // the shoes section — everything downstream still keys off the name.
  const workoutTypeName =
    types.find((t) => t.id === workoutTypeId)?.name ?? "";

  const autoTitle = [todayTitlePrefix(), workoutTypeName]
    .filter(Boolean)
    .join(" ");

  function makeInstance(exercise: CatalogExercise, autoAdded: boolean): DraftInstance {
    return { uid: nextUid(), exercise, groups: [newGroup()], showOptional: false, autoAdded };
  }

  /** Apply the side effects of choosing a type (by name): autofill title and
   * swap in the single-activity auto-add exercise. */
  function applyType(id: string | null, name: string) {
    setWorkoutTypeId(id);
    if (!titleEdited) setTitle(name ? `${todayTitlePrefix()} ${name}` : "");

    const exName = autoExerciseForType(name);
    const target = exName
      ? catalog.find((e) => e.name.toLowerCase() === exName.toLowerCase())
      : undefined;

    setInstances((prev) => {
      const kept = prev.filter((i) => !(i.autoAdded && isEmptyInstance(i)));
      if (!target) return kept;
      if (kept.some((i) => i.exercise.id === target.id)) return kept;
      return [makeInstance(target, true), ...kept];
    });
  }

  function chooseType(value: string) {
    if (value === NEW_TYPE) {
      setAddingType(true);
      return;
    }
    setAddingType(false);
    const picked = types.find((t) => t.id === value);
    applyType(picked?.id ?? null, picked?.name ?? "");
  }

  function handleAddType() {
    const name = newTypeName.trim();
    if (!name || !newTypeEmoji) return;
    startTypeTransition(async () => {
      const result = await createWorkoutType(name, newTypeEmoji);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      const t = result.type;
      // Add (or reuse) in the local catalog, select it, and apply side effects.
      setTypes((prev) =>
        prev.some((p) => p.id === t.id) ? prev : [...prev, t],
      );
      applyType(t.id, t.name);
      setAddingType(false);
      setNewTypeName("");
      setNewTypeEmoji("");
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

  function buildPayload(): SavePayload {
    // Shoes only apply to runs; for any other type we send nothing (and clear
    // any previously-attached pair on edit by sending no shoe fields → null).
    const running = isRunningType(workoutTypeName);
    const addingNew = running && shoeId === NEW_SHOE;
    const existing = running && shoeId && shoeId !== NEW_SHOE ? shoeId : undefined;
    const newName = addingNew ? newShoeName.trim() : "";
    const startMi = Number(newShoeStartMi);

    return {
      title: title || undefined,
      workoutTypeId: workoutTypeId || undefined,
      workoutTypeName: workoutTypeName || undefined,
      notes: notes || undefined,
      performedOn,
      planId: prefill?.planId,
      planDayDate: prefill?.planDayDate,
      shoeId: existing,
      shoeName: newName || undefined,
      shoeStartingMi:
        addingNew && newShoeStartMi.trim() !== "" && !Number.isNaN(startMi)
          ? startMi
          : undefined,
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
  }

  function handleSave() {
    setError(null);
    const payload = buildPayload();
    if (payload.instances.every((i) => i.setGroups.length === 0)) {
      setError("Add at least one exercise with a completed set.");
      return;
    }
    startTransition(async () => {
      const result = editing
        ? await updateWorkout(initial!.id, payload)
        : await createWorkout(payload);
      if (result?.error) setError(result.error);
    });
  }

  function handleDelete() {
    if (!initial) return;
    if (!confirm("Delete this workout? This cannot be undone.")) return;
    startTransition(async () => {
      const result = await deleteWorkout(initial.id);
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
      <div className="space-y-1.5">
        <span className="text-sm font-medium">Workout type</span>
        <select
          value={addingType ? NEW_TYPE : workoutTypeId ?? ""}
          onChange={(e) => chooseType(e.target.value)}
          className="w-full rounded-xl border border-line-strong bg-surface px-3 py-2 text-base text-ink focus:border-rust focus:outline-none"
        >
          <option value="">No type</option>
          {types.map((t) => (
            <option key={t.id} value={t.id}>
              {t.emoji} {t.name}
            </option>
          ))}
          <option value={NEW_TYPE}>+ Add new type…</option>
        </select>

        {addingType && (
          <div className="space-y-2 rounded-xl border border-line bg-surface p-3">
            <label className="block space-y-0.5">
              <span className="text-xs text-faint">Name</span>
              <input
                value={newTypeName}
                onChange={(e) => setNewTypeName(e.target.value)}
                placeholder="e.g. Pilates"
                className="w-full rounded-xl border border-line-strong bg-paper px-3 py-2 text-base text-ink placeholder:text-faint focus:border-rust focus:outline-none"
              />
            </label>
            <div className="space-y-0.5">
              <span className="text-xs text-faint">Emoji</span>
              <EmojiPicker value={newTypeEmoji} onChange={setNewTypeEmoji} />
            </div>
            <div className="flex items-center gap-3 pt-1">
              <button
                type="button"
                onClick={handleAddType}
                disabled={!newTypeName.trim() || !newTypeEmoji || typePending}
                className="rounded-full bg-rust px-4 py-1.5 text-sm font-medium text-on-rust disabled:opacity-50"
              >
                {typePending ? "Adding…" : "Add type"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setAddingType(false);
                  setNewTypeName("");
                  setNewTypeEmoji("");
                }}
                className="text-sm text-muted hover:text-ink"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-3">
        <label className="flex-1 space-y-1.5">
          <span className="text-sm font-medium">Date</span>
          <input
            type="date"
            value={performedOn}
            max={todayIso()}
            onChange={(e) => setPerformedOn(e.target.value)}
            className="w-full rounded-xl border border-line-strong bg-surface px-3 py-2 text-base text-ink focus:border-rust focus:outline-none"
          />
        </label>
      </div>

      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Title (optional)</span>
        <input
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            setTitleEdited(true);
          }}
          placeholder={autoTitle || "Auto-filled from date + type"}
          className="w-full rounded-xl border border-line-strong bg-surface px-3 py-2 text-base text-ink placeholder:text-faint focus:border-rust focus:outline-none"
        />
      </label>

      {/* Shoes: running workouts only, always optional. */}
      {isRunningType(workoutTypeName) && (
        <div className="space-y-1.5">
          <span className="text-sm font-medium">Shoes (optional)</span>
          <select
            value={shoeId}
            onChange={(e) => setShoeId(e.target.value)}
            className="w-full rounded-xl border border-line-strong bg-surface px-3 py-2 text-base text-ink focus:border-rust focus:outline-none"
          >
            <option value="">No shoes</option>
            {shoes.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.distanceMi} mi)
              </option>
            ))}
            <option value={NEW_SHOE}>+ Add new shoes…</option>
          </select>

          {shoeId === NEW_SHOE && (
            <div className="flex flex-wrap gap-2 pt-1">
              <label className="flex-1 space-y-0.5">
                <span className="text-xs text-faint">Name</span>
                <input
                  value={newShoeName}
                  onChange={(e) => setNewShoeName(e.target.value)}
                  placeholder="e.g. Nike Pegasus 40"
                  className="w-full rounded-xl border border-line-strong bg-surface px-3 py-2 text-base text-ink placeholder:text-faint focus:border-rust focus:outline-none"
                />
              </label>
              <label className="w-32 space-y-0.5">
                <span className="text-xs text-faint">Starting mileage (mi)</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step={0.1}
                  value={newShoeStartMi}
                  onChange={(e) => setNewShoeStartMi(e.target.value)}
                  placeholder="0"
                  className="w-full rounded-xl border border-line-strong bg-surface px-3 py-2 text-base text-ink placeholder:text-faint focus:border-rust focus:outline-none"
                />
              </label>
            </div>
          )}
        </div>
      )}

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

      <div className="space-y-1.5 rounded-2xl border border-dashed border-line-strong p-5">
        <span className="text-sm font-medium">
          {instances.length > 0 ? "Add another exercise" : "Add an exercise"}
        </span>
        <Combobox
          options={exerciseOptions}
          placeholder="Search exercises…"
          resetOnSelect
          onSelect={addExercise}
        />
      </div>

      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Notes (optional)</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="How the session felt, conditions, anything worth remembering…"
          className="w-full rounded-xl border border-line-strong bg-surface px-3 py-2 text-base text-ink placeholder:text-faint focus:border-rust focus:outline-none"
        />
      </label>

      {error && <p className="text-sm text-rust">{error}</p>}

      <div className="sticky bottom-0 -mx-5 flex flex-col gap-2 border-t border-line bg-paper/90 px-5 py-3 backdrop-blur sm:mx-0 sm:rounded-2xl sm:border">
        <button
          onClick={handleSave}
          disabled={isPending || instances.length === 0}
          className="w-full rounded-full bg-rust px-4 py-3 text-base font-medium text-on-rust disabled:opacity-50"
        >
          {isPending ? "Saving…" : editing ? "Save changes" : "Save workout"}
        </button>
        {editing && (
          <div className="flex justify-between text-sm">
            <button
              onClick={() => router.push(`/workouts/${initial!.id}`)}
              className="text-muted hover:text-ink"
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              disabled={isPending}
              className="text-rust hover:underline disabled:opacity-50"
            >
              Delete workout
            </button>
          </div>
        )}
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
    <section className="rounded-2xl border border-line bg-surface p-5 shadow-[0_2px_10px_rgba(43,38,32,0.04)]">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-serif text-lg font-semibold">
          {instance.exercise.name}
        </h2>
        <button
          onClick={() => onRemove(instance.uid)}
          className="text-sm text-faint hover:text-rust"
        >
          Remove
        </button>
      </div>

      <div className="space-y-2">
        {instance.groups.map((group, gi) => (
          // Top-aligned so every input box lines up on its top edge regardless of
          // what sits below it (the duration field hangs MM/SS captions under its
          // inputs). The remove button re-pins itself to the bottom via self-end.
          <div key={gi} className="flex flex-wrap items-start gap-2">
            {visibleFields.map((field) => (
              <MetricInput
                key={field.key}
                field={field}
                value={group.metrics[field.key] ?? ""}
                onChange={(value) =>
                  onUpdateMetric(instance.uid, gi, field.key, value)
                }
              />
            ))}
            <label className="w-16 space-y-0.5">
              <span className="text-xs text-faint">Sets</span>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                value={group.count}
                onChange={(e) => onUpdateCount(instance.uid, gi, e.target.value)}
                className="w-full rounded-xl border border-line-strong bg-paper px-2 py-2 text-base text-ink focus:border-rust focus:outline-none"
              />
            </label>
            {instance.groups.length > 1 && (
              <button
                onClick={() => onRemoveGroup(instance.uid, gi)}
                className="self-end pb-2 text-sm text-faint hover:text-rust"
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
          className="text-sm font-medium text-rust hover:underline"
        >
          + Add another set/row
        </button>
        {hasOptional && (
          <button
            onClick={() => onToggleOptional(instance.uid)}
            className="text-sm text-muted hover:underline"
          >
            {instance.showOptional ? "− Fewer fields" : "+ More fields"}
          </button>
        )}
      </div>
    </section>
  );
}

/**
 * One metric field's input. Most fields are a single decimal input, but a
 * duration field (`minSec`) renders as paired minutes + seconds inputs for
 * convenience — the value it reads/writes is still DISPLAY-MINUTES (e.g. "2.5"),
 * so the rest of the form, the save conversion, and stored data are unchanged.
 */
function MetricInput({
  field,
  value,
  onChange,
}: {
  field: MetricField;
  value: string;
  onChange: (value: string) => void;
}) {
  const labelText = `${field.label}${field.optional ? "" : " *"}`;

  if (field.minSec) {
    // Render as a MM:SS clock. The displayed value is still DISPLAY-MINUTES under
    // the hood; empty shows "00" so the field reads "00:00" and invites editing.
    const { min, sec } = minutesToMinSec(value);
    // Text inputs (not number) so the zero-padded "00" actually renders — number
    // inputs strip leading zeros. We keep only digits from each field.
    const pad2 = (n: string) => (n === "" ? "00" : n.padStart(2, "0"));
    const digits = (s: string) => s.replace(/\D/g, "");
    const commit = (m: string, s: string) => onChange(minSecToMinutes(m, s));
    const timeInput =
      "w-10 rounded-xl border border-line-strong bg-paper px-1.5 py-2 text-center text-base tabular-nums text-ink focus:border-rust focus:outline-none";
    return (
      <div className="space-y-0.5">
        <span className="text-xs text-faint">{labelText}</span>
        <div className="flex items-start gap-1">
          <div className="flex flex-col items-center">
            <input
              type="text"
              inputMode="numeric"
              aria-label={`${field.label} minutes`}
              value={pad2(min)}
              onFocus={(e) => e.target.select()}
              onChange={(e) => commit(digits(e.target.value), sec)}
              className={timeInput}
            />
            <span className="text-[10px] uppercase tracking-wide text-faint">
              MM
            </span>
          </div>
          <span aria-hidden className="pt-2 text-base font-medium text-muted">
            :
          </span>
          <div className="flex flex-col items-center">
            <input
              type="text"
              inputMode="numeric"
              aria-label={`${field.label} seconds`}
              value={pad2(sec)}
              onFocus={(e) => e.target.select()}
              onChange={(e) => commit(min, digits(e.target.value))}
              className={timeInput}
            />
            <span className="text-[10px] uppercase tracking-wide text-faint">
              SS
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <label className="flex-1 space-y-0.5">
      <span className="text-xs text-faint">
        {field.label}
        {field.unit ? ` (${field.unit})` : ""}
        {field.optional ? "" : " *"}
      </span>
      <input
        type="number"
        inputMode="decimal"
        step={field.step}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-line-strong bg-paper px-2 py-2 text-base text-ink focus:border-rust focus:outline-none"
      />
    </label>
  );
}
