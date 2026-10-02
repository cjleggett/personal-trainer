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

  // The mobile hamburger menu, which surfaces the primary nav (hidden on
  // small screens) so Workout History / Plan stay reachable on a phone.
  const [navOpen, setNavOpen] = useState(false);
  const navRef = useRef<HTMLDivElement>(null);

  // A nav item is active when the path matches or sits under its route.
  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  // Close either dropdown on outside click or Escape.
  useEffect(() => {
    if (!menuOpen && !navOpen) return;
    const onPointer = (e: MouseEvent) => {
      const target = e.target as Node;
      if (menuRef.current && !menuRef.current.contains(target)) {
        setMenuOpen(false);
      }
      if (navRef.current && !navRef.current.contains(target)) {
        setNavOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenuOpen(false);
        setNavOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen, navOpen]);

  const accountActive = ACCOUNT_NAV.some((item) => isActive(item.href));

  return (
    <header className="sticky top-0 z-10 flex h-[68px] items-center gap-3 border-b border-line bg-paper/90 px-4 backdrop-blur sm:gap-6 sm:px-8">
      <div className="relative sm:hidden" ref={navRef}>
        <button
          type="button"
          onClick={() => {
            setNavOpen((o) => !o);
            setMenuOpen(false);
          }}
          aria-haspopup="menu"
          aria-expanded={navOpen}
          aria-label="Menu"
          className="grid size-[34px] place-items-center rounded-lg text-ink transition-colors hover:bg-rust-soft"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            aria-hidden
          >
            <path d="M3 5h14M3 10h14M3 15h14" />
          </svg>
        </button>

        {navOpen && (
          <div
            role="menu"
            className="absolute left-0 top-[calc(100%+8px)] w-56 overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-[0_8px_24px_rgba(43,38,32,0.12)]"
          >
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                role="menuitem"
                onClick={() => setNavOpen(false)}
                className={`block px-3 py-2 text-sm transition-colors hover:bg-rust-soft ${
                  isActive(item.href) ? "font-medium text-ink" : "text-ink"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </div>
        )}
      </div>

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
        aria-label="Log workout"
        className="rounded-full bg-ink px-3 py-1.5 text-sm font-medium whitespace-nowrap text-paper sm:px-4"
      >
        <span className="sm:hidden" aria-hidden>
          +
        </span>
        <span className="hidden sm:inline">+ Log workout</span>
      </Link>

      <div className="relative" ref={menuRef}>
        <button
          type="button"
          onClick={() => {
            setMenuOpen((o) => !o);
            setNavOpen(false);
          }}
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
