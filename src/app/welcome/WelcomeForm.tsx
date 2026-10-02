"use client";

import { useActionState } from "react";
import { completeOnboarding, type OnboardResult } from "./actions";

/**
 * First-run onboarding form. Collects the required name, an optional birthday,
 * and the optional "About me" notes. On success the action redirects to the
 * dashboard, so there's no success state to render here — only errors.
 */
export function WelcomeForm() {
  const [state, formAction, isPending] = useActionState<
    OnboardResult | null,
    FormData
  >(completeOnboarding, null);

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Name</span>
          <input
            type="text"
            name="display_name"
            required
            autoFocus
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
            className="w-full rounded-xl border border-line-strong bg-surface px-3 py-2 text-base text-ink placeholder:text-faint focus:border-rust focus:outline-none"
          />
        </label>
      </div>

      <section className="space-y-2 rounded-2xl border border-line bg-surface p-5">
        <div>
          <h2 className="font-serif text-xl font-semibold">About me</h2>
          <p className="text-sm text-muted">
            Tell your coach anything worth knowing — your experience, how often
            you train, past injuries, what you&apos;re working toward, or how you
            like to be pushed. Your coach reads this to tailor every plan,
            workout, and bit of advice to you. Only you can edit it, and you can
            always update it later from the <strong>About me</strong> page.
          </p>
        </div>
        <textarea
          name="about_me"
          rows={6}
          placeholder="e.g. I'm a 32-year-old former soccer player getting back into shape after an ACL repair. I train best in the mornings and travel often for work."
          className="w-full rounded-xl border border-line-strong bg-paper px-3 py-2 text-base text-ink placeholder:text-faint focus:border-rust focus:outline-none"
        />
      </section>

      {state && !state.ok && <p className="text-sm text-rust">{state.error}</p>}

      <button
        type="submit"
        disabled={isPending}
        className="w-fit rounded-full bg-rust px-5 py-2 text-sm font-medium text-on-rust disabled:opacity-50"
      >
        {isPending ? "Saving…" : "Get started"}
      </button>
    </form>
  );
}
