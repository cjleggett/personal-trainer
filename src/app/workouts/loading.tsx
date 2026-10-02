import { Header } from "@/app/Header";

// Shown instantly during navigation to /workouts while the server component
// loads — replaces the frozen-page feeling with a clean skeleton. Renders the
// Header so the navbar stays put during the load (no full-page flash).
export default function Loading() {
  return (
    <>
      <Header />
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-5 sm:p-8">
      <div className="h-10 w-56 animate-pulse rounded-lg bg-line" />
      <ul className="flex flex-col gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <li
            key={i}
            className="h-20 animate-pulse rounded-2xl border border-line bg-surface"
          />
        ))}
      </ul>
      </main>
    </>
  );
}
