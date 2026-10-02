/**
 * localStorage keys for the client-persisted coach + plan-edit chats.
 *
 * Both transcripts live in the browser (the server is stateless per turn), so
 * the key MUST be scoped to the signed-in user — otherwise the next account to
 * use the same browser restores the previous user's conversation (a cross-user
 * data leak). `clearChatStorage` additionally wipes them on sign-out so nothing
 * lingers on a shared machine.
 *
 * The clear prefixes deliberately match the un-scoped legacy keys
 * (`coach-chat-v1`, `plan-edit-<id>-v1`) too, so sign-out also sweeps away any
 * transcript persisted before keys were user-scoped.
 */

const COACH_PREFIX = "coach-chat";
const PLAN_EDIT_PREFIX = "plan-edit";

/** Per-user key for the dashboard coach chat. */
export function coachChatKey(userId: string): string {
  return `${COACH_PREFIX}-v1:${userId}`;
}

/** Per-user, per-plan key for the plan-edit chat. */
export function planEditKey(userId: string, planId: string): string {
  return `${PLAN_EDIT_PREFIX}:${userId}:${planId}:v1`;
}

/** Remove every coach / plan-edit transcript from localStorage (sign-out). */
export function clearChatStorage() {
  if (typeof window === "undefined") return;
  // Iterate backwards: removeItem shifts the index of later keys.
  for (let i = window.localStorage.length - 1; i >= 0; i--) {
    const key = window.localStorage.key(i);
    if (key && (key.startsWith(COACH_PREFIX) || key.startsWith(PLAN_EDIT_PREFIX))) {
      window.localStorage.removeItem(key);
    }
  }
}
