"use client";

import { useTransition, useState } from "react";
import { deletePlan } from "../actions";

/**
 * Deletes a training plan after a confirmation prompt. On success the server
 * action redirects to the dashboard; logged workouts are preserved (just
 * unlinked from the plan), so this only removes the plan itself.
 */
export function DeletePlanButton({ planId }: { planId: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onDelete() {
    if (
      !confirm(
        "Delete this training plan? Workouts you've logged are kept — only the plan is removed. This can't be undone.",
      )
    )
      return;
    setError(null);
    startTransition(async () => {
      const result = await deletePlan(planId);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={onDelete}
        disabled={isPending}
        className="text-sm font-medium text-rust hover:underline disabled:opacity-50"
      >
        {isPending ? "Deleting…" : "Delete plan"}
      </button>
      {error && <p className="text-sm text-rust">{error}</p>}
    </div>
  );
}
