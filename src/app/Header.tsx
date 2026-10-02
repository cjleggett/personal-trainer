"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { signout } from "@/app/login/actions";
import { clearChatStorage } from "@/lib/coach/chat-storage";

/**
 * The shared Momentum top bar: brand, primary nav with active-route highlight,
 * a prominent "Log workout" action, and the account avatar.
 *
 * The avatar opens a dropdown with the account pages (About me, Usage) and
 * sign-out. Rendered from the authenticated pages (passing the signed-in user's
 * email so the avatar initial is correct). It's a client component because the
 * active link derives from the pathname and the menu holds open/close state.
 */

const NAV = [
  { href: "/dashboard", label: "Home" },
  { href: "/workouts", label: "Workout History" },
  { href: "/plan", label: "Plan" },
] as const;

// Account pages, tucked under the avatar dropdown.
const ACCOUNT_NAV = [
  { href: "/about", label: "About me" },
  { href: "/usage", label: "Usage" },
] as const;

export function Header({ email }: { email?: string | null }) {
  const pathname = usePathname();
  const initial = (email?.trim()?.[0] ?? "?").toUpperCase();

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // A nav item is active when the path matches or sits under its route.
  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  // Close the dropdown on outside click or Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const onPointer = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const accountActive = ACCOUNT_NAV.some((item) => isActive(item.href));

  return (
    <header className="sticky top-0 z-10 flex h-[68px] items-center gap-6 border-b border-line bg-paper/90 px-4 backdrop-blur sm:px-8">
      <Link href="/dashboard" className="flex items-center gap-2">
        <span className="grid size-[26px] place-items-center rounded-lg bg-rust text-on-rust">
          {/* Brand mark: a sneaker tilted forward mid-stride (replaces the old
              "M"). Shoe body is currentColor; the cut details are drawn in the
              badge's rust fill so they read as negative space in both themes. */}
          <svg
            viewBox="0 0 24 24"
            className="size-[19px]"
            aria-hidden="true"
          >
            <g transform="rotate(26 12 12) translate(12 12.5) scale(1.3) translate(-12 -12.5)" fill="currentColor">
              <path d="M3.6 14.6 L3.6 10.6 C3.6 9.9 4.3 9.5 4.9 9.8 L5.9 10.3 C6.3 10.5 6.5 10.9 6.5 11.3 L6.5 11.9 L7.5 10.3 C7.8 9.8 8.5 9.75 8.9 10.2 L10 11.4 L10.6 11 C10.9 10.8 11.3 10.9 11.5 11.2 L12.1 12.2 C13.6 12.25 15.4 12.4 16.9 12.7 C19.1 13.1 20.6 13.9 21.1 14.9 C21.3 15.3 21 15.7 20.5 15.7 L3.6 15.7 Z" />
              <path d="M2.6 15.6 L21 15.6 C21.6 15.6 21.7 16.5 21 17 C20.3 17.5 19.5 17.7 18.4 17.7 L4.5 17.7 C3.3 17.7 2.6 16.9 2.6 15.9 Z" />
            </g>
            <g
              transform="rotate(26 12 12) translate(12 12.5) scale(1.3) translate(-12 -12.5)"
              fill="none"
              stroke="var(--rust)"
              strokeWidth="0.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M6.5 11.9 L6.5 14.6" />
              <line x1="3.3" y1="16.6" x2="20.3" y2="16.6" strokeWidth="0.55" />
              <path d="M8.9 14.6 C11 13.6 13.8 13.2 16.2 13.3" strokeWidth="1.1" />
              <line x1="9.1" y1="11.4" x2="10.6" y2="10.8" />
              <line x1="9.7" y1="12.3" x2="11.2" y2="11.7" />
              <line x1="10.3" y1="13.1" x2="11.9" y2="12.6" />
            </g>
          </svg>
        </span>
        <span className="font-serif text-xl font-semibold tracking-tight">
          MomentumFitness
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

      <div className="relative" ref={menuRef}>
        <button
          type="button"
          onClick={() => setMenuOpen((o) => !o)}
          title={email ?? "Account"}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          className={`grid size-[34px] place-items-center rounded-full bg-rust font-serif font-semibold text-on-rust transition-shadow ${
            menuOpen || accountActive
              ? "ring-2 ring-rust ring-offset-2 ring-offset-paper"
              : ""
          }`}
        >
          {initial}
        </button>

        {menuOpen && (
          <div
            role="menu"
            className="absolute right-0 top-[calc(100%+8px)] w-56 overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-[0_8px_24px_rgba(43,38,32,0.12)]"
          >
            {email && (
              <p className="truncate px-3 py-2 text-xs text-muted" title={email}>
                {email}
              </p>
            )}
            {ACCOUNT_NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                role="menuitem"
                onClick={() => setMenuOpen(false)}
                className={`block px-3 py-2 text-sm transition-colors hover:bg-rust-soft ${
                  isActive(item.href) ? "font-medium text-ink" : "text-ink"
                }`}
              >
                {item.label}
              </Link>
            ))}
            <div className="my-1 border-t border-line" />
            <form action={signout}>
              <button
                type="submit"
                role="menuitem"
                // Sign-out is a server action and can't touch localStorage, so
                // sweep the client-persisted coach/plan chats here before it runs.
                onClick={clearChatStorage}
                className="block w-full px-3 py-2 text-left text-sm text-rust transition-colors hover:bg-rust-soft"
              >
                Sign out
              </button>
            </form>
          </div>
        )}
      </div>
    </header>
  );
}
