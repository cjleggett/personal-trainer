import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { NewWorkoutForm, type CatalogExercise } from "./NewWorkoutForm";

export default async function NewWorkoutPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Global seeds (owner_id null) + this user's customs are both visible via RLS.
  const { data: exercises } = await supabase
    .from("exercises")
    .select("id, name, muscle_group, measurement_type")
    .order("name");

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-4 sm:p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">New workout</h1>
        <a href="/dashboard" className="text-sm text-zinc-500 hover:underline">
          Cancel
        </a>
      </header>
      <NewWorkoutForm catalog={(exercises as CatalogExercise[]) ?? []} />
    </main>
  );
}
