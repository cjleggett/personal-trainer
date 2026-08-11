export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">Training Log</h1>
      <p className="max-w-md text-zinc-600 dark:text-zinc-400">
        Create training plans, generate workouts, and log your training.
      </p>
      <p className="text-sm text-zinc-500">
        Skeleton is up. Auth, logging, and generation come next.
      </p>
    </main>
  );
}
