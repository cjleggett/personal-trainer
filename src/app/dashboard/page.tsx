import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signout } from "@/app/login/actions";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // The proxy already gates this route, but re-check here as defense in depth.
  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, goals, experience_level")
    .eq("id", user.id)
    .single();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <form action={signout}>
          <button
            type="submit"
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium dark:border-zinc-700"
          >
            Sign out
          </button>
        </form>
      </header>

      <p className="text-zinc-600 dark:text-zinc-400">
        Signed in as <span className="font-medium">{user.email}</span>
        {profile?.display_name ? ` (${profile.display_name})` : ""}.
      </p>

      <a
        href="/workouts/new"
        className="inline-flex w-fit items-center rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-zinc-900"
      >
        Log a workout
      </a>

      <p className="text-sm text-zinc-500">
        Workout history, generation, and training plans come next.
      </p>
    </main>
  );
}
