"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Save the two "About me" blobs.
 *
 *   about_me    — user-only context. The agent reads it but never writes it.
 *   coach_notes — shared memory. The agent updates it during chat; the user can
 *                 also edit it here.
 *
 * Both live on the profiles row (RLS scopes the update to the owner). We write
 * both in one update so the form saves atomically. Empty strings are stored as
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

  const { error } = await supabase
    .from("profiles")
    .update({
      about_me: clean(formData.get("about_me")),
      coach_notes: clean(formData.get("coach_notes")),
    })
    .eq("id", user.id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/about");
  return { ok: true };
}
