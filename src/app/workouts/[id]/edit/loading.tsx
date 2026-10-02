import { Header } from "@/app/Header";

// Instant skeleton while the workout, catalog, and shoes load for editing.
export default function Loading() {
  return (
    <>
      <Header />
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-5 sm:p-8">
        <div className="space-y-3">
          <div className="h-4 w-32 animate-pulse rounded bg-line" />
          <div className="h-10 w-56 animate-pulse rounded-lg bg-line" />
        </div>

        {/* Field rows */}
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="space-y-1.5">
            <div className="h-4 w-28 animate-pulse rounded bg-line" />
            <div className="h-10 w-full animate-pulse rounded-xl border border-line bg-surface" />
          </div>
        ))}

        {/* Exercise card */}
        <div className="h-40 animate-pulse rounded-2xl border border-line bg-surface" />
      </main>
    </>
  );
}
