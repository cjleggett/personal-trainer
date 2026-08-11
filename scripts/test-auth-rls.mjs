// End-to-end auth + RLS verification against the live Supabase project.
// Uses the anon key exactly like the browser would, so RLS is enforced.
// Run: node scripts/test-auth-rls.mjs   (loads .env.local)
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

// Minimal .env.local loader (no dependency).
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m) process.env[m[1]] ??= m[2].trim();
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const stamp = Date.now();
const userA = { email: `test-a-${stamp}@example.com`, password: "test-pw-123456" };
const userB = { email: `test-b-${stamp}@example.com`, password: "test-pw-123456" };

// Each client is an isolated session, like two separate browsers.
const a = createClient(url, anon, { auth: { persistSession: false } });
const b = createClient(url, anon, { auth: { persistSession: false } });

let failures = 0;
const check = (cond, msg) => {
  console.log(`${cond ? "✅" : "❌"} ${msg}`);
  if (!cond) failures++;
};

// 1. Sign up both users (autoconfirm on → immediate session).
const { data: aSignup, error: aErr } = await a.auth.signUp(userA);
check(!aErr && !!aSignup.session, `User A signed up and got a session${aErr ? " — " + aErr.message : ""}`);
const { data: bSignup, error: bErr } = await b.auth.signUp(userB);
check(!bErr && !!bSignup.session, `User B signed up and got a session${bErr ? " — " + bErr.message : ""}`);

const aId = aSignup.user?.id;
const bId = bSignup.user?.id;

// 2. Signup trigger auto-created each profile row.
const { data: aProfile } = await a.from("profiles").select("id").eq("id", aId).single();
check(aProfile?.id === aId, "User A's profile row was auto-created by the signup trigger");

// 3. User A can update their own profile (insert/update policy).
const { error: updErr } = await a.from("profiles").update({ display_name: "Alice" }).eq("id", aId);
check(!updErr, `User A can update their own profile${updErr ? " — " + updErr.message : ""}`);

// 4. THE KEY RLS CHECK: user B cannot read user A's profile row.
const { data: leak } = await b.from("profiles").select("id, display_name").eq("id", aId);
check(Array.isArray(leak) && leak.length === 0, "User B CANNOT read User A's profile row (RLS enforced)");

// 5. User B sees only their own row when selecting all.
const { data: bAll } = await b.from("profiles").select("id");
check(
  Array.isArray(bAll) && bAll.length === 1 && bAll[0].id === bId,
  "User B's unfiltered SELECT returns only their own row",
);

// 6. User B cannot update user A's row (write RLS).
const { data: bUpd } = await b.from("profiles").update({ display_name: "hacked" }).eq("id", aId).select();
check(Array.isArray(bUpd) && bUpd.length === 0, "User B CANNOT update User A's row");

console.log(`\n${failures === 0 ? "ALL PASSED" : failures + " CHECK(S) FAILED"}`);
console.log(`\nTest user ids (for cleanup): ${aId} ${bId}`);
process.exit(failures === 0 ? 0 : 1);
