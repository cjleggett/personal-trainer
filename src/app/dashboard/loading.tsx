import { Header } from "@/app/Header";

// Instant skeleton while the dashboard's data (profile, plan, stats) loads.
// Renders the Header so the navbar stays put — no full-page flash.
export default function Loading() {
  return (
    <>
      <Header />
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-10 p-5 sm:p-8">
        {/* Hero */}
        <div className="space-y-3">
          <div className="h-4 w-28 animate-pulse rounded bg-line" />
          <div className="h-10 w-80 max-w-full animate-pulse rounded-lg bg-line" />
          <div className="h-4 w-64 max-w-full animate-pulse rounded bg-line" />
        </div>

        {/* Stats */}
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div
              key={i}
              className="h-32 animate-pulse rounded-2xl border border-line bg-surface"
            />
          ))}
        </div>

        {/* Coach */}
        <div className="space-y-4">
          <div className="h-7 w-40 animate-pulse rounded bg-line" />
          <div className="h-48 animate-pulse rounded-[20px] border border-line bg-surface" />
        </div>
      </main>
    </>
  );
}
