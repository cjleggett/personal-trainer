import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
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
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-4 sm:p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">About me</h1>
        <Link href="/dashboard" className="text-sm text-zinc-500 hover:underline">
          Done
        </Link>
      </header>
      <p className="text-zinc-600 dark:text-zinc-400">
        This context helps your coach tailor plans, workouts, and advice to you.
      </p>
      <AboutForm
        aboutMe={profile?.about_me ?? ""}
        coachNotes={profile?.coach_notes ?? ""}
      />
    </main>
  );
}
