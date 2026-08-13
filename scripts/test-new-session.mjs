// Verifies the new-session save path as an authenticated user: unit conversion
// (km→m, min→s) and generated summary columns, exactly as the server action does.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m) process.env[m[1]] ??= m[2].trim();
}
const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false } },
);

// Mirror the server action's canonical conversion (display units → SI).
const FACTOR = { distance_m: 1000, duration_s: 60 }; // km→m, min→s for these keys
const toCanonical = (raw) => {
  const out = {};
  for (const [k, v] of Object.entries(raw)) out[k] = (FACTOR[k] ?? 1) * v;
  return out;
};

let failures = 0;
const check = (c, m, x) => { console.log(`${c ? "✅" : "❌"} ${m}${!c && x ? " — " + JSON.stringify(x) : ""}`); if (!c) failures++; };

const stamp = Date.now();
const { data: up } = await sb.auth.signUp({ email: `sess-${stamp}@example.com`, password: "test-pw-123456" });
const uid = up.user?.id;
check(!!uid, "Signed up");

const { data: run } = await sb.from("exercises").select("id").eq("name", "Running").is("owner_id", null).single();

// Simulate the form: user entered 5 km over 25 min with 80m elevation.
const { data: workout } = await sb.from("workouts").insert({ user_id: uid, title: "Morning run" }).select("id").single();
const displaySet = { distance_m: 5, duration_s: 25, elevation_gain_m: 80 }; // km, min, m
const { data: inst, error } = await sb.from("exercise_instances").insert({
  workout_id: workout.id, exercise_id: run.id, user_id: uid, position: 0,
  sets: [toCanonical(displaySet)],
}).select("sets, total_distance_m, total_duration_s, total_elevation_m").single();

check(!error, "Instance inserted", error);
check(inst?.sets?.[0]?.distance_m === 5000, "5 km stored as 5000 m", inst?.sets);
check(inst?.sets?.[0]?.duration_s === 1500, "25 min stored as 1500 s", inst?.sets);
check(Number(inst?.total_distance_m) === 5000, "Summary total_distance_m = 5000", inst);
check(Number(inst?.total_duration_s) === 1500, "Summary total_duration_s = 1500", inst);
check(Number(inst?.total_elevation_m) === 80, "Summary total_elevation_m = 80", inst);

// Reload the session as the app's history would.
const { data: reload } = await sb.from("workouts")
  .select("title, exercise_instances(position, sets, total_distance_m)")
  .eq("id", workout.id).single();
check(reload?.exercise_instances?.length === 1, "Workout reloads with its instance (nested select)", reload);

console.log(`\n${failures === 0 ? "ALL PASSED" : failures + " FAILED"}`);
console.log(`cleanup id: ${uid}`);
process.exit(failures === 0 ? 0 : 1);
