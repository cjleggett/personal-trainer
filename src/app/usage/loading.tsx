import { Header } from "@/app/Header";

// Instant skeleton while token-usage rows load.
export default function Loading() {
  return (
    <>
      <Header />
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-5 sm:p-8">
        <div className="space-y-3">
          <div className="h-4 w-28 animate-pulse rounded bg-line" />
          <div className="h-10 w-40 animate-pulse rounded-lg bg-line" />
        </div>

        {/* Totals */}
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-20 animate-pulse rounded-2xl border border-line bg-surface"
            />
          ))}
        </div>

        {/* By feature + recent */}
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="space-y-3">
            <div className="h-7 w-40 animate-pulse rounded bg-line" />
            <div className="h-40 animate-pulse rounded-2xl border border-line bg-surface" />
          </div>
        ))}
      </main>
    </>
  );
}
