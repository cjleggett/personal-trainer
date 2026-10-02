"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Auth is email + password today. To add magic-link later, add an action that
 * calls `supabase.auth.signInWithOtp({ email })` — no schema change, existing
 * accounts keep working. See CLAUDE.md.
 */

export async function login(_prevState: unknown, formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    // Echo the email back so the field survives the failed submit.
    return { error: error.message, email };
  }

  revalidatePath("/", "layout");
  // Users who haven't completed onboarding (no name yet) go through /welcome;
  // the welcome page itself bounces onboarded users on to the dashboard.
  redirect((await needsOnboarding(data.user?.id)) ? "/welcome" : "/dashboard");
}

/** True when the user has no profile name set yet (first-run onboarding). */
async function needsOnboarding(userId?: string): Promise<boolean> {
  if (!userId) return false;
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", userId)
    .single();
  return !data?.display_name?.trim();
}

export async function signup(_prevState: unknown, formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirm_password") ?? "");

  // Validate server-side — never trust the client to have matched them.
  if (password !== confirmPassword) {
    return { error: "Passwords do not match.", email };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error) {
    // Echo the email back so the field survives the failed submit.
    return { error: error.message, email };
  }

  // With email confirmation off (the current config), signUp returns an active
  // session — take the new user straight into onboarding. If confirmation is
  // enabled there's no session yet, so surface a message instead of redirecting
  // into a gated route.
  if (data.session) {
    revalidatePath("/", "layout");
    redirect("/welcome");
  }

  return {
    message:
      "Account created. If email confirmation is enabled, check your inbox to confirm, then sign in.",
  };
}

export async function signout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
