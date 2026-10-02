"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Save the "About me" page fields.
 *
 *   display_name — the user's name (required). How the coach addresses them.
 *   birthday     — optional date of birth; lets the coach reason about age.
 *   about_me     — user-only context. The agent reads it but never writes it.
 *   coach_notes  — shared memory. The agent updates it during chat; the user can
 *                  also edit it here.
 *
 * All live on the profiles row (RLS scopes the update to the owner). We write
 * them in one update so the form saves atomically. Empty strings are stored as
 * null so the context builder cleanly omits them.
 */
export type SaveAboutResult = { ok: true } | { ok: false; error: string };

export async function saveAbout(
  _prevState: SaveAboutResult | null,
  formData: FormData,
): Promise<SaveAboutResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const clean = (v: FormDataEntryValue | null) => {
    const s = (v == null ? "" : String(v)).trim();
    return s.length ? s : null;
  };

  // Name is required — reject a blank save rather than clearing it to null.
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
      coach_notes: clean(formData.get("coach_notes")),
    })
    .eq("id", user.id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/about");
  return { ok: true };
}
