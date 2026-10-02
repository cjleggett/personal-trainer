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
        <span className="grid size-11 place-items-center rounded-xl bg-rust text-on-rust">
          {/* Brand mark: the forward-leaning sneaker (matches Header.tsx). */}
          <svg viewBox="0 0 24 24" className="size-8" aria-hidden="true">
            <g
              transform="rotate(26 12 12) translate(12 12.5) scale(1.3) translate(-12 -12.5)"
              fill="currentColor"
            >
              <path d="M3.6 14.6 L3.6 10.6 C3.6 9.9 4.3 9.5 4.9 9.8 L5.9 10.3 C6.3 10.5 6.5 10.9 6.5 11.3 L6.5 11.9 L7.5 10.3 C7.8 9.8 8.5 9.75 8.9 10.2 L10 11.4 L10.6 11 C10.9 10.8 11.3 10.9 11.5 11.2 L12.1 12.2 C13.6 12.25 15.4 12.4 16.9 12.7 C19.1 13.1 20.6 13.9 21.1 14.9 C21.3 15.3 21 15.7 20.5 15.7 L3.6 15.7 Z" />
              <path d="M2.6 15.6 L21 15.6 C21.6 15.6 21.7 16.5 21 17 C20.3 17.5 19.5 17.7 18.4 17.7 L4.5 17.7 C3.3 17.7 2.6 16.9 2.6 15.9 Z" />
            </g>
            <g
              transform="rotate(26 12 12) translate(12 12.5) scale(1.3) translate(-12 -12.5)"
              fill="none"
              stroke="var(--rust)"
              strokeWidth="0.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M6.5 11.9 L6.5 14.6" />
              <line x1="3.3" y1="16.6" x2="20.3" y2="16.6" strokeWidth="0.55" />
              <path d="M8.9 14.6 C11 13.6 13.8 13.2 16.2 13.3" strokeWidth="1.1" />
              <line x1="9.1" y1="11.4" x2="10.6" y2="10.8" />
              <line x1="9.7" y1="12.3" x2="11.2" y2="11.7" />
              <line x1="10.3" y1="13.1" x2="11.9" y2="12.6" />
            </g>
          </svg>
        </span>
        <div className="space-y-2">
          <h1 className="font-serif text-4xl font-semibold tracking-tight">
            Welcome to MomentumFitness
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
