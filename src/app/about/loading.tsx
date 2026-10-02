import { Header } from "@/app/Header";

// Instant skeleton while the profile (about_me, coach_notes) loads.
export default function Loading() {
  return (
    <>
      <Header />
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-5 sm:p-8">
        <div className="space-y-3">
          <div className="h-4 w-32 animate-pulse rounded bg-line" />
          <div className="h-10 w-48 animate-pulse rounded-lg bg-line" />
          <div className="h-4 w-72 max-w-full animate-pulse rounded bg-line" />
        </div>

        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <div className="h-6 w-36 animate-pulse rounded bg-line" />
            <div className="h-36 animate-pulse rounded-xl border border-line bg-surface" />
          </div>
        ))}
      </main>
    </>
  );
}
