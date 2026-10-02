"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Save the onboarding fields for a new user, then send them to the dashboard.
 *
 *   display_name — required. How the coach addresses them.
 *   birthday     — optional date of birth.
 *   about_me     — optional free-text context the coach reads (never overwrites).
 *
 * Mirrors `saveAbout` (src/app/about/actions.ts) but redirects into the app on
 * success, since this is the first-run flow. Empty strings become null.
 */
export type OnboardResult = { ok: false; error: string };

export async function completeOnboarding(
  _prevState: OnboardResult | null,
  formData: FormData,
): Promise<OnboardResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const clean = (v: FormDataEntryValue | null) => {
    const s = (v == null ? "" : String(v)).trim();
    return s.length ? s : null;
  };

  const displayName = clean(formData.get("display_name"));
  if (!displayName) {
    return { ok: false, error: "Please enter your name." };
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      display_name: displayName,
      birthday: clean(formData.get("birthday")),
      about_me: clean(formData.get("about_me")),
    })
    .eq("id", user.id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/", "layout");
  redirect("/dashboard");
}
