"use client";

import { useActionState } from "react";
import { saveAbout, type SaveAboutResult } from "./actions";

/**
 * Edits the two "About me" blobs. Both post through one server action so the
 * form saves atomically. `coach_notes` is the shared field the agent also
 * writes during chat — the note under it explains that.
 */
export function AboutForm({
  displayName,
  birthday,
  aboutMe,
  coachNotes,
}: {
  displayName: string;
  birthday: string;
  aboutMe: string;
  coachNotes: string;
}) {
  const [state, formAction, isPending] = useActionState<
    SaveAboutResult | null,
    FormData
  >(saveAbout, null);

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <section className="space-y-4">
        <div>
          <h2 className="font-serif text-xl font-semibold">Your details</h2>
          <p className="text-sm text-muted">
            Your name is how your coach addresses you. Your birthday is optional
            and helps tailor training to your age.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Name</span>
            <input
              type="text"
              name="display_name"
              required
              defaultValue={displayName}
              placeholder="e.g. Alex"
              className="w-full rounded-xl border border-line-strong bg-surface px-3 py-2 text-base text-ink placeholder:text-faint focus:border-rust focus:outline-none"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">
              Birthday <span className="text-muted">(optional)</span>
            </span>
            <input
              type="date"
              name="birthday"
              defaultValue={birthday}
              className="w-full rounded-xl border border-line-strong bg-surface px-3 py-2 text-base text-ink placeholder:text-faint focus:border-rust focus:outline-none"
            />
          </label>
        </div>
      </section>

      <section className="space-y-2">
        <div>
          <h2 className="font-serif text-xl font-semibold">About me</h2>
          <p className="text-sm text-muted">
            Anything you want your coach to know about you. Only you edit this —
            the coach reads it but won&apos;t change it.
          </p>
        </div>
        <textarea
          name="about_me"
          defaultValue={aboutMe}
          rows={6}
          placeholder="e.g. I'm a 32-year-old former soccer player getting back into shape after an ACL repair. I train best in the mornings and travel often for work."
          className="w-full rounded-xl border border-line-strong bg-surface px-3 py-2 text-base text-ink placeholder:text-faint focus:border-rust focus:outline-none"
        />
      </section>

      <section className="space-y-2">
        <div>
          <h2 className="font-serif text-xl font-semibold">Coach notes</h2>
          <p className="text-sm text-muted">
            Durable things your coach has picked up over time. The coach updates
            this automatically as it learns — you can edit or clear it here too.
          </p>
        </div>
        <textarea
          name="coach_notes"
          defaultValue={coachNotes}
          rows={6}
          placeholder="e.g. Dislikes burpees. Prefers trail runs. Has a standing soccer game Tuesdays."
          className="w-full rounded-xl border border-line-strong bg-surface px-3 py-2 text-base text-ink placeholder:text-faint focus:border-rust focus:outline-none"
        />
      </section>

      {state && !state.ok && <p className="text-sm text-rust">{state.error}</p>}
      {state?.ok && <p className="text-sm text-good">Saved.</p>}

      <button
        type="submit"
        disabled={isPending}
        className="w-fit rounded-full bg-rust px-5 py-2 text-sm font-medium text-on-rust disabled:opacity-50"
      >
        {isPending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
