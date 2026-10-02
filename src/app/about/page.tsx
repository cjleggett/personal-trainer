import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/app/Header";
import { AboutForm } from "./AboutForm";

export default async function AboutPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("about_me, coach_notes")
    .eq("id", user.id)
    .single(); // RLS scopes to the owner

  return (
    <>
      <Header email={user.email} />
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-5 sm:p-8">
        <div>
          <Link href="/dashboard" className="text-sm text-muted hover:text-ink">
            ← Back to dashboard
          </Link>
          <h1 className="mt-4 font-serif text-4xl font-semibold tracking-tight">
            About me
          </h1>
          <p className="mt-2 text-muted">
            This context helps your coach tailor plans, workouts, and advice to
            you.
          </p>
        </div>
        <AboutForm
          aboutMe={profile?.about_me ?? ""}
          coachNotes={profile?.coach_notes ?? ""}
        />
      </main>
    </>
  );
}
