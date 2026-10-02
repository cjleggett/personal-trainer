import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { WelcomeForm } from "./WelcomeForm";

/**
 * First-run onboarding. New users land here right after signing up (and on any
 * later login until they've set a name). Once `display_name` is set, this page
 * bounces to the dashboard so it's never shown again.
 */
export default async function WelcomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .single(); // RLS scopes to the owner

  // Already onboarded — don't make them do it again.
  if (profile?.display_name?.trim()) redirect("/dashboard");

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-8 p-5 sm:p-8">
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="grid size-11 place-items-center rounded-xl bg-rust font-serif text-lg font-bold text-on-rust">
          M
        </span>
        <div className="space-y-2">
          <h1 className="font-serif text-4xl font-semibold tracking-tight">
            Welcome to Momentum
          </h1>
          <p className="mx-auto max-w-prose text-muted">
            A couple of quick things so your coach can get to know you. Only your
            name is required — everything else you can add or change anytime.
          </p>
        </div>
      </div>

      <WelcomeForm />
    </main>
  );
}
