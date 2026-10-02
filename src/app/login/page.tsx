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
          <span className="grid size-11 place-items-center rounded-xl bg-rust font-serif text-lg font-bold text-on-rust">
            M
          </span>
          <div className="space-y-1">
            <h1 className="font-serif text-3xl font-semibold tracking-tight">
              Momentum
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
