"use client";

import { useActionState } from "react";
import { saveAbout, type SaveAboutResult } from "./actions";

/**
 * Edits the two "About me" blobs. Both post through one server action so the
 * form saves atomically. `coach_notes` is the shared field the agent also
 * writes during chat — the note under it explains that.
 */
export function AboutForm({
  aboutMe,
  coachNotes,
}: {
  aboutMe: string;
  coachNotes: string;
}) {
  const [state, formAction, isPending] = useActionState<
    SaveAboutResult | null,
    FormData
  >(saveAbout, null);

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <section className="space-y-2">
        <div>
          <h2 className="text-lg font-semibold">About me</h2>
          <p className="text-sm text-zinc-500">
            Anything you want your coach to know about you. Only you edit this —
            the coach reads it but won&apos;t change it.
          </p>
        </div>
        <textarea
          name="about_me"
          defaultValue={aboutMe}
          rows={6}
          placeholder="e.g. I'm a 32-year-old former soccer player getting back into shape after an ACL repair. I train best in the mornings and travel often for work."
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-900"
        />
      </section>

      <section className="space-y-2">
        <div>
          <h2 className="text-lg font-semibold">Coach notes</h2>
          <p className="text-sm text-zinc-500">
            Durable things your coach has picked up over time. The coach updates
            this automatically as it learns — you can edit or clear it here too.
          </p>
        </div>
        <textarea
          name="coach_notes"
          defaultValue={coachNotes}
          rows={6}
          placeholder="e.g. Dislikes burpees. Prefers trail runs. Has a standing soccer game Tuesdays."
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-900"
        />
      </section>

      {state && !state.ok && (
        <p className="text-sm text-red-600">{state.error}</p>
      )}
      {state?.ok && (
        <p className="text-sm text-green-600">Saved.</p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-fit rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-zinc-900"
      >
        {isPending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
