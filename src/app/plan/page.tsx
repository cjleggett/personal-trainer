import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/app/Header";
import { IntakeChat } from "./IntakeChat";

export default async function PlanPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // If the athlete already has an active plan, the "Plan" tab opens straight to
  // it (where they can view and edit it). Only when there's no active plan does
  // this page show the goal-intake flow for building a new one.
  const { data: activePlan } = await supabase
    .from("training_plans")
    .select("id")
    .eq("status", "active")
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle(); // RLS scopes to the owner
  if (activePlan) redirect(`/plan/${activePlan.id}`);

  return (
    <>
      <Header email={user.email} />
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-5 sm:p-8">
        <div>
          <Link href="/dashboard" className="text-sm text-muted hover:text-ink">
            ← Back to dashboard
          </Link>
          <p className="mt-4 text-sm font-semibold uppercase tracking-[0.12em] text-rust">
            New plan
          </p>
          <h1 className="mt-2 font-serif text-4xl font-semibold tracking-tight">
            New training plan
          </h1>
          <p className="mt-2 text-muted">
            Tell me what you&apos;re training for. I&apos;ll look at your recent
            history and ask a few questions before building a plan.
          </p>
        </div>
        <IntakeChat />
      </main>
    </>
  );
}
