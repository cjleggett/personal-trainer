import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { WorkoutForm, type CatalogExercise } from "../WorkoutForm";

export default async function NewWorkoutPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: exercises } = await supabase
    .from("exercises")
    .select("id, name, muscle_group, measurement_type")
    .order("name");

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-4 sm:p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">New workout</h1>
        <Link href="/dashboard" className="text-sm text-zinc-500 hover:underline">
          Cancel
        </Link>
      </header>
      <WorkoutForm catalog={(exercises as CatalogExercise[]) ?? []} />
    </main>
  );
}
