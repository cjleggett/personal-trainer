// Verifies the logging schema against the live DB using the anon key (RLS on).
// Signs up a throwaway user, creates a workout with two exercise-instances
// (a lift and a run w/ elevation), and checks the generated summary columns +
// RLS. Cleans up the auth user at the end via CLI (see caller).
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m) process.env[m[1]] ??= m[2].trim();
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const a = createClient(url, anon, { auth: { persistSession: false } });
const b = createClient(url, anon, { auth: { persistSession: false } });

let failures = 0;
const check = (cond, msg, extra) => {
  console.log(`${cond ? "✅" : "❌"} ${msg}${!cond && extra ? " — " + JSON.stringify(extra) : ""}`);
  if (!cond) failures++;
};

const stamp = Date.now();
const { data: aUp } = await a.auth.signUp({ email: `log-a-${stamp}@example.com`, password: "test-pw-123456" });
const { data: bUp } = await b.auth.signUp({ email: `log-b-${stamp}@example.com`, password: "test-pw-123456" });
const aId = aUp.user?.id, bId = bUp.user?.id;
check(!!aId && !!bId, "Two users signed up");

// Global catalog visible to a fresh user
const { data: catalog } = await a.from("exercises").select("id, name, measurement_type").is("owner_id", null);
check((catalog?.length ?? 0) >= 14, "Global catalog seed visible", { count: catalog?.length });
const squat = catalog.find((e) => e.name === "Back Squat");
const run = catalog.find((e) => e.name === "Running");

// Create a workout session
const { data: workout, error: wErr } = await a
  .from("workouts")
  .insert({ user_id: aId, title: "Test session", extra: { mood: "good" } })
  .select()
  .single();
check(!wErr && !!workout, "Workout created", wErr);

// Lift instance: 100x5, 100x5, 105x3  -> total_load = 100*5+100*5+105*3 = 1315
const { data: lift, error: lErr } = await a
  .from("exercise_instances")
  .insert({
    workout_id: workout.id, exercise_id: squat.id, user_id: aId, position: 0,
    sets: [{ weight: 100, reps: 5 }, { weight: 100, reps: 5 }, { weight: 105, reps: 3 }],
  })
  .select("total_load, total_distance_m, total_duration_s, total_elevation_m")
  .single();
check(!lErr && Number(lift?.total_load) === 1315, "Generated total_load correct (1315)", lift);

// Run instance: 5000m in 1500s, 120m elevation, + free-form music in extra
const { data: cardio, error: cErr } = await a
  .from("exercise_instances")
  .insert({
    workout_id: workout.id, exercise_id: run.id, user_id: aId, position: 1,
    sets: [{ distance_m: 5000, duration_s: 1500, elevation_gain_m: 120, avg_hr: 155 }],
    extra: { playlist: "Long Run Vibes" },
  })
  .select("total_distance_m, total_duration_s, total_elevation_m, extra")
  .single();
check(!cErr && Number(cardio?.total_distance_m) === 5000, "Generated total_distance_m correct (5000)", cardio);
check(Number(cardio?.total_duration_s) === 1500, "Generated total_duration_s correct (1500)", cardio);
check(Number(cardio?.total_elevation_m) === 120, "Generated total_elevation_m correct (120)", cardio);
check(cardio?.extra?.playlist === "Long Run Vibes", "Free-form extra (music) round-trips", cardio?.extra);

// RLS: user B cannot see user A's workout or instances
const { data: bSeesWorkouts } = await b.from("workouts").select("id");
check((bSeesWorkouts?.length ?? 0) === 0, "User B cannot read User A's workouts (RLS)", bSeesWorkouts);
const { data: bSeesInstances } = await b.from("exercise_instances").select("id");
check((bSeesInstances?.length ?? 0) === 0, "User B cannot read User A's instances (RLS)", bSeesInstances);

// User B can add a custom exercise; A cannot see B's custom
const { data: custom, error: custErr } = await b
  .from("exercises")
  .insert({ owner_id: bId, name: "B's Secret Lift", measurement_type: "weight_reps" })
  .select().single();
check(!custErr && !!custom, "User B can add a custom exercise", custErr);
const { data: aSeesB } = await a.from("exercises").select("id").eq("id", custom.id);
check((aSeesB?.length ?? 0) === 0, "User A cannot see User B's custom exercise (RLS)", aSeesB);

console.log(`\n${failures === 0 ? "ALL PASSED" : failures + " CHECK(S) FAILED"}`);
console.log(`cleanup ids: ${aId} ${bId}`);
process.exit(failures === 0 ? 0 : 1);
