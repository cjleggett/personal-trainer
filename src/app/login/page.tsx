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
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Training Log</h1>
          <p className="text-sm text-zinc-500">Sign in or create an account.</p>
        </div>

        <form className="space-y-3">
          <label className="block space-y-1">
            <span className="text-sm font-medium">Email</span>
            <input
              type="email"
              name="email"
              required
              autoComplete="email"
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium">Password</span>
            <input
              type="password"
              name="password"
              required
              autoComplete="current-password"
              minLength={6}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>

          {(loginState?.error || signupState?.error) && (
            <p className="text-sm text-red-600">
              {loginState?.error ?? signupState?.error}
            </p>
          )}
          {signupState?.message && (
            <p className="text-sm text-green-700">{signupState.message}</p>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              formAction={loginAction}
              disabled={loginPending || signupPending}
              className="flex-1 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-zinc-900"
            >
              {loginPending ? "Signing in…" : "Sign in"}
            </button>
            <button
              type="submit"
              formAction={signupAction}
              disabled={loginPending || signupPending}
              className="flex-1 rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium disabled:opacity-50 dark:border-zinc-700"
            >
              {signupPending ? "Creating…" : "Sign up"}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
