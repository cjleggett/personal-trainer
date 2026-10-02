"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signout } from "@/app/login/actions";

/**
 * The shared Momentum top bar: brand, primary nav with active-route highlight,
 * a prominent "Log workout" action, and the account avatar / sign-out.
 *
 * Rendered from the authenticated pages (passing the signed-in user's email so
 * the avatar initial is correct). It's a client component because the active
 * link is derived from the current pathname.
 */

const NAV = [
  { href: "/dashboard", label: "Today" },
  { href: "/workouts", label: "History" },
  { href: "/plan", label: "Plan" },
  { href: "/about", label: "About me" },
  { href: "/usage", label: "Usage" },
] as const;

export function Header({ email }: { email?: string | null }) {
  const pathname = usePathname();
  const initial = (email?.trim()?.[0] ?? "?").toUpperCase();

  // A nav item is active when the path matches or sits under its route.
  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header className="sticky top-0 z-10 flex h-[68px] items-center gap-6 border-b border-line bg-paper/90 px-4 backdrop-blur sm:px-8">
      <Link href="/dashboard" className="flex items-center gap-2">
        <span className="grid size-[26px] place-items-center rounded-lg bg-rust text-sm font-bold text-on-rust">
          M
        </span>
        <span className="font-serif text-xl font-semibold tracking-tight">
          Momentum
        </span>
      </Link>

      <nav className="ml-2 hidden gap-1 sm:flex">
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`rounded-full px-3 py-1.5 text-sm whitespace-nowrap transition-colors ${
              isActive(item.href)
                ? "bg-rust-soft font-medium text-ink"
                : "text-muted hover:text-ink"
            }`}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="flex-1" />

      <Link
        href="/workouts/new"
        className="rounded-full bg-ink px-4 py-1.5 text-sm font-medium whitespace-nowrap text-paper"
      >
        + Log workout
      </Link>

      <form action={signout}>
        <button
          type="submit"
          title={email ? `Sign out (${email})` : "Sign out"}
          className="grid size-[34px] place-items-center rounded-full bg-rust font-serif font-semibold text-on-rust"
        >
          {initial}
        </button>
      </form>
    </header>
  );
}
