"use client";

import { useActionState } from "react";
import { login, signup } from "./actions";

type FormState = { error?: string; message?: string } | null;

const initialState: FormState = null;

export default function LoginPage() {
  const [loginState, loginAction, loginPending] = useActionState<
    FormState,
    FormData
  >(login, initialState);
  const [signupState, signupAction, signupPending] = useActionState<
    FormState,
    FormData
  >(signup, initialState);

  return (
    <main className="flex flex-1 flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="grid size-11 place-items-center rounded-xl bg-rust text-on-rust">
            {/* Brand mark: the forward-leaning sneaker (matches Header.tsx). */}
            <svg viewBox="0 0 24 24" className="size-8" aria-hidden="true">
              <g
                transform="rotate(26 12 12) translate(12 12.5) scale(1.3) translate(-12 -12.5)"
                fill="currentColor"
              >
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
          <div className="space-y-1">
            <h1 className="font-serif text-3xl font-semibold tracking-tight">
              MomentumFitness
            </h1>
            <p className="text-sm text-muted">Sign in or create an account.</p>
          </div>
        </div>

        <form className="space-y-3 rounded-2xl border border-line bg-surface p-6 shadow-[0_2px_10px_rgba(43,38,32,0.04)]">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Email</span>
            <input
              type="email"
              name="email"
              required
              autoComplete="email"
              className="w-full rounded-xl border border-line-strong bg-paper px-3 py-2 text-base text-ink focus:border-rust focus:outline-none"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Password</span>
            <input
              type="password"
              name="password"
              required
              autoComplete="current-password"
              minLength={6}
              className="w-full rounded-xl border border-line-strong bg-paper px-3 py-2 text-base text-ink focus:border-rust focus:outline-none"
            />
          </label>

          {(loginState?.error || signupState?.error) && (
            <p className="text-sm text-rust">
              {loginState?.error ?? signupState?.error}
            </p>
          )}
          {signupState?.message && (
            <p className="text-sm text-good">{signupState.message}</p>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              formAction={loginAction}
              disabled={loginPending || signupPending}
              className="flex-1 rounded-full bg-rust px-4 py-2 text-sm font-medium text-on-rust disabled:opacity-50"
            >
              {loginPending ? "Signing in…" : "Sign in"}
            </button>
            <button
              type="submit"
              formAction={signupAction}
              disabled={loginPending || signupPending}
              className="flex-1 rounded-full border border-line-strong px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              {signupPending ? "Creating…" : "Sign up"}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
