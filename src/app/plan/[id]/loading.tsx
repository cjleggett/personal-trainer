import { Header } from "@/app/Header";

// Instant skeleton while a training plan loads and validates.
export default function Loading() {
  return (
    <>
      <Header />
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-5 sm:p-8">
        <div className="h-4 w-40 animate-pulse rounded bg-line" />
        <div className="space-y-3">
          <div className="h-4 w-28 animate-pulse rounded bg-line" />
          <div className="h-10 w-72 max-w-full animate-pulse rounded-lg bg-line" />
          <div className="h-4 w-full animate-pulse rounded bg-line" />
          <div className="h-4 w-56 animate-pulse rounded bg-line" />
        </div>

        {/* Overview table */}
        <div className="h-40 animate-pulse rounded-2xl border border-line bg-surface" />

        {/* Weeks */}
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="space-y-3">
            <div className="h-7 w-44 animate-pulse rounded bg-line" />
            <div className="h-48 animate-pulse rounded-2xl border border-line bg-surface" />
          </div>
        ))}
      </main>
    </>
  );
}
