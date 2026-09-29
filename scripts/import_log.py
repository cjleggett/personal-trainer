#!/usr/bin/env python3
"""
One-time importer for data/connor_log.csv → workouts / exercise_instances.

Two phases:
  --dry-run  : parse everything, print coverage + a JSON preview to /tmp, write
               NOTHING. Use this to eyeball quality first.
  --emit-sql : print SQL (exercise upserts + workout/instance inserts) to stdout,
               parameterized by USER_ID, for piping into `supabase db query`.

Storage is canonical SI (meters, seconds, kg), matching src/lib/logging/metrics.ts.
The model deliberately assigns ONE measurement_type per exercise; instances coerce
to it (e.g. a bodyweight set of a weight_reps lift just omits weight).
"""
import csv, re, json, sys, datetime as dt

KG_PER_LB = 0.45359237
M_PER_MILE = 1609.344
M_PER_FOOT = 0.3048

CSV = "data/connor_log.csv"

def num(s):
    """Lenient float: take the first number in a possibly-dirty cell (e.g. '2-3')."""
    m = re.search(r"\d+(?:\.\d+)?", s or "")
    return float(m.group()) if m else None

# ── Date parsing ──────────────────────────────────────────────────────────────
def parse_date(s, prev_year):
    s = s.strip()
    m = re.match(r"^(\d{1,2})/(\d{1,2})/(\d{4})$", s)
    if m:
        mo, d, y = int(m[1]), int(m[2]), int(m[3])
        return dt.date(y, mo, d)
    m = re.match(r"^(\d{1,2})/(\d{1,2})$", s)
    if m:
        # No year: the file's first row. Rows are reverse-chronological, so use
        # the year of the following row (the CSV's most recent dated entry).
        return dt.date(prev_year, int(m[1]), int(m[2]))
    raise ValueError(f"bad date {s!r}")

# ── Exercise name normalization ─────────────────────────────────────────────────
# Map many raw spellings/variants onto one canonical exercise name. Applied after
# lowercasing + stripping parentheticals/qualifiers.
CANON = [
    (r"leg press", "Leg Press"),
    (r"spanish squat", "Spanish Squat"),
    (r"goblet squat", "Goblet Squat"),
    (r"(rear.?foot )?elevated split squat", "Elevated Split Squat"),
    (r"\bsplit squat", "Split Squat"),
    (r"double.?leg squat|double leg squat|\bair squat", "Bodyweight Squat"),
    (r"single.?leg squat", "Single-Leg Squat"),
    (r"sumo (squat/)?deadlift|sumo deadlift", "Sumo Deadlift"),
    (r"single.?leg deadlift|sl deadlift|bosu single.?leg deadlift", "Single-Leg Deadlift"),
    (r"double.?leg deadlift|bosu deadlift", "Deadlift"),
    (r"dumbbell (romanian deadlift|rdl)|dumbbell rdl|\brdl", "Dumbbell RDL"),
    (r"b.?stance rdl", "B-Stance RDL"),
    (r"single.?leg hamstring curl", "Single-Leg Hamstring Curl"),
    (r"(double.?leg )?hamstring curl|leg curl machine|leg curl|lying hamstring curl", "Hamstring Curl"),
    (r"knee extension|leg extension|sl leg extension|leg extensions", "Leg Extension"),
    (r"hip machine", "Hip Abduction Machine"),
    (r"(standing |seated )?(db |dumbbell )?calf raise|calf machine|calf extension|heel raise|calf drop", "Calf Raise"),
    (r"wall sit", "Wall Sit"),
    (r"curtsy lunge", "Curtsy Lunge"),
    (r"lateral lunge", "Lateral Lunge"),
    (r"(forward |walking )?lunge|reverse lunge|walking lunch", "Lunge"),
    (r"steps? ?ups?|step.?up", "Step-up"),
    (r"lateral step down|lateral step-down|step down", "Lateral Step-down"),
    (r"glute bridge|weighted glute bridge", "Glute Bridge"),
    (r"bridge march", "Bridge March"),
    (r"incline dumbbell bench|incline dumbbell bench press", "Incline Dumbbell Bench Press"),
    (r"dumbbell (bench|chest) press|dumbell (bench )?press|dumbbell press|chest press machine|dumbbell press machine|chest press", "Dumbbell Bench Press"),
    (r"chest.?supported dumbbell row|dumbbell row|single.?arm dumbbell row|renegade row", "Dumbbell Row"),
    (r"seated cable (low )?row|seated cable pull|cable low row|cable pull", "Seated Cable Row"),
    (r"lat pulldown", "Lat Pulldown"),
    (r"assisted (pull.?up|curl up)|pull.?up", "Pull-up"),
    (r"push.?up", "Push-up"),
    (r"(seated )?(dumbbell )?shoulder press|z.?press|z-press", "Shoulder Press"),
    (r"bicep curl|arm curl", "Bicep Curl"),
    (r"tricep (rope|pushdown|rope pushdown)|tricep ropes", "Tricep Pushdown"),
    (r"alternating dumbbell snatch|dumbbell snatch", "Dumbbell Snatch"),
    (r"farmer.?s carr|suitcase carr|suitcase car|farmers carr", "Farmer's Carry"),
    (r"\bplank(s)?\b", "Plank"),
    (r"side plank", "Side Plank"),
    (r"crunch", "Crunch"),
    (r"dead ?bug", "Dead Bug"),
    (r"bird.?dog", "Bird-Dog"),
    (r"supine psoas hold|psoas hold", "Supine Psoas Hold"),
    (r"quad set", "Quad Set"),
    (r"standing target tap|target tap", "Standing Target Tap"),
    (r"single.?leg elevated heel raise", "Calf Raise"),
    (r"marching .?a.? drill|marching a drill", "Marching A-Drill"),
    (r"side.?to.?side hop|side to side hop", "Lateral Hop"),
    (r"triple hop", "Triple Hop"),
    (r"single leg (jump|hop)|single-leg hop", "Single-Leg Hop"),
    (r"ladder", "Agility Ladder"),
    (r"elliptical", "Elliptical"),
    (r"treadmill incline walk|treadmill walk", "Treadmill Walk"),
    (r"stair.?master|stairmaster", "Stairmaster"),
    (r"\bbike\b|biking|\bbik\b", "Stationary Bike"),
    (r"foam roll", "Foam Rolling"),
    (r"\byoga\b", "Yoga"),
    (r"leg swing|leg swings", "Leg Swings"),
    (r"high knees|butt kick", "High Knees & Butt Kicks"),
    (r"lateral shuffle", "Lateral Shuffle"),
    (r"isometric wall sit", "Wall Sit"),
    (r"eccentric goblet squat|slow eccentric goblet squat", "Goblet Squat"),
    (r"umbbell bench|dumbell bench", "Dumbbell Bench Press"),
    (r"burpee", "Burpee"),
    (r"stretch", "Stretching"),
    (r"\bwalk\b", "Treadmill Walk"),
]

# Muscle group + measurement type per canonical exercise.
META = {
    "Leg Press": ("legs", "weight_reps"),
    "Spanish Squat": ("legs", "weight_reps"),
    "Goblet Squat": ("legs", "weight_reps"),
    "Elevated Split Squat": ("legs", "weight_reps"),
    "Split Squat": ("legs", "weight_reps"),
    "Bodyweight Squat": ("legs", "reps_only"),
    "Single-Leg Squat": ("legs", "reps_only"),
    "Sumo Deadlift": ("legs", "weight_reps"),
    "Single-Leg Deadlift": ("legs", "weight_reps"),
    "Deadlift": ("back", "weight_reps"),
    "Dumbbell RDL": ("legs", "weight_reps"),
    "B-Stance RDL": ("legs", "weight_reps"),
    "Single-Leg Hamstring Curl": ("legs", "weight_reps"),
    "Hamstring Curl": ("legs", "weight_reps"),
    "Leg Extension": ("legs", "weight_reps"),
    "Hip Abduction Machine": ("legs", "weight_reps"),
    "Calf Raise": ("legs", "weight_reps"),
    "Wall Sit": ("legs", "time_only"),
    "Curtsy Lunge": ("legs", "weight_reps"),
    "Lateral Lunge": ("legs", "weight_reps"),
    "Lunge": ("legs", "weight_reps"),
    "Step-up": ("legs", "weight_reps"),
    "Lateral Step-down": ("legs", "reps_only"),
    "Glute Bridge": ("legs", "weight_reps"),
    "Bridge March": ("core", "reps_only"),
    "Incline Dumbbell Bench Press": ("chest", "weight_reps"),
    "Dumbbell Bench Press": ("chest", "weight_reps"),
    "Dumbbell Row": ("back", "weight_reps"),
    "Seated Cable Row": ("back", "weight_reps"),
    "Lat Pulldown": ("back", "weight_reps"),
    "Pull-up": ("back", "reps_only"),
    "Push-up": ("chest", "reps_only"),
    "Shoulder Press": ("shoulders", "weight_reps"),
    "Bicep Curl": ("arms", "weight_reps"),
    "Tricep Pushdown": ("arms", "weight_reps"),
    "Dumbbell Snatch": ("full", "weight_reps"),
    "Farmer's Carry": ("full", "time_only"),
    "Plank": ("core", "time_only"),
    "Side Plank": ("core", "time_only"),
    "Crunch": ("core", "reps_only"),
    "Dead Bug": ("core", "reps_only"),
    "Bird-Dog": ("core", "reps_only"),
    "Supine Psoas Hold": ("core", "reps_only"),
    "Quad Set": ("legs", "reps_only"),
    "Standing Target Tap": ("legs", "reps_only"),
    "Marching A-Drill": ("legs", "reps_only"),
    "Lateral Hop": ("legs", "reps_only"),
    "Triple Hop": ("legs", "reps_only"),
    "Single-Leg Hop": ("legs", "reps_only"),
    "Agility Ladder": ("cardio", "reps_only"),
    "Elliptical": ("cardio", "time_only"),
    "Treadmill Walk": ("cardio", "time_only"),
    "Stairmaster": ("cardio", "time_only"),
    "Stationary Bike": ("cardio", "time_only"),
    "Foam Rolling": ("full", "time_only"),
    "Yoga": ("full", "time_only"),
    "Leg Swings": ("legs", "reps_only"),
    "High Knees & Butt Kicks": ("cardio", "time_only"),
    "Lateral Shuffle": ("cardio", "reps_only"),
    "Burpee": ("full", "reps_only"),
    "Stretching": ("full", "time_only"),
}

STRETCH_PATS = (r"stretch", r"burpee", r"dynamic stretch")

def canon_name(raw):
    s = raw.strip().lower()
    s = re.sub(r"\(.*?\)", "", s)          # drop parentheticals
    s = re.sub(r"[\"“”']", "", s)
    s = s.strip(" -:.")
    for pat, name in CANON:
        if re.search(pat, s):
            return name
    return None  # unrecognized → caller keeps as note

# ── Set spec parsing ────────────────────────────────────────────────────────────
def parse_weight_lb(spec):
    m = re.search(r"(\d+(?:\.\d+)?)\s*(?:lb|lbs)\b", spec)
    if m: return float(m[1])
    m = re.search(r"@\s*(\d+(?:\.\d+)?)", spec)
    if m and "bodyweight" not in spec.lower(): return float(m[1])
    return None

def parse_sets_reps(spec):
    # 3x10, 3 x 10, 3 sets of 10 reps, 3 sets, 10 reps
    m = re.search(r"(\d+)\s*[x×]\s*(\d+)", spec)
    if m: return int(m[1]), int(m[2])
    m = re.search(r"(\d+)\s*sets?.*?(\d+)\s*reps?", spec)
    if m: return int(m[1]), int(m[2])
    m = re.search(r"(\d+)\s*sets?,\s*(\d+)\s*reps?", spec)
    if m: return int(m[1]), int(m[2])
    return None

def parse_duration_s(spec):
    # 3x60s, 3x45 sec, 5m, 10 min, 5-10 minutes, 45 seconds
    m = re.search(r"(\d+)\s*[x×]\s*(\d+)\s*(?:s\b|sec|seconds?)", spec)
    if m: return int(m[1]), int(m[2])
    m = re.search(r"(\d+)\s*sets?.*?(\d+)\s*(?:s\b|sec|seconds?)", spec)
    if m: return int(m[1]), int(m[2])
    m = re.search(r"(\d+)(?:-\d+)?\s*(?:min|minutes?|m)\b", spec)
    if m: return 1, int(m[1]) * 60
    m = re.search(r"(\d+)\s*(?:sec|seconds?|s)\b", spec)
    if m: return 1, int(m[1])
    return None

def split_line(raw_line):
    """Split a gym line into one or more parseable sub-lines.

    Handles compound entries the log uses:
      - a prefix header ("Core: A + B", "Core finisher: A + B") → drop the header,
        split the remainder on '+'
      - "Warm-up: 5 min bike, leg swings" → drop 'Warm-up:', split on ','/'+'
      - "+ 10 minutes yoga" → strip leading '+'
    Non-compound lines pass through unchanged (as a 1-element list).
    """
    line = raw_line.strip().strip('"').rstrip("​").lstrip("+ ").strip()
    if not line:
        return []
    low = line.lower()
    # Prefix headers whose payload is a list of exercises after the colon.
    for pre in ("core finisher", "core", "warm-up", "warmup", "agility warm-up"):
        if low.startswith(pre) and ":" in line:
            payload = line.split(":", 1)[1]
            return [p.strip() for p in re.split(r"\+|,", payload) if p.strip()]
    # Bare compound ("Crunches 4x15 + planks 3x60s") with no header.
    if " + " in line:
        return [p.strip() for p in line.split("+") if p.strip()]
    return [line]

def parse_line(raw_line):
    """Return (canonical_name, measurement_type, sets[list of set dicts]) or None."""
    line = raw_line.strip().strip('"').rstrip("​")  # strip zero-width junk
    if not line or line.endswith(":"):
        return None  # section header
    # Split name vs spec on the first ':' or ' - '
    if ":" in line:
        name, spec = line.split(":", 1)
    elif " - " in line:
        name, spec = line.split(" - ", 1)
    else:
        # "40lb 4x10" style: name is text before first number-group
        m = re.match(r"(.+?)\s+(\d.*)$", line)
        if m: name, spec = m[1], m[2]
        else: name, spec = line, ""
    cn = canon_name(name)
    if not cn:
        return None
    mtype = META[cn][1]
    spec = spec.strip()

    sets = []
    if mtype == "time_only":
        d = parse_duration_s(spec)
        load = parse_weight_lb(spec)
        if d:
            n, secs = d
            obj = {"duration_s": secs}
            if load: obj["load"] = round(load * KG_PER_LB, 4)
            sets = [dict(obj) for _ in range(n)]
        else:
            sets = [{"duration_s": 60}]  # fallback: assume ~1 min hold
    else:
        sr = parse_sets_reps(spec)
        w = parse_weight_lb(spec)
        n, reps = sr if sr else (1, 10)
        obj = {"reps": reps}
        if mtype == "weight_reps" and w:
            obj["weight"] = round(w * KG_PER_LB, 4)
        sets = [dict(obj) for _ in range(n)]
    return cn, mtype, sets

# ── Non-gym activity → catalog exercise ─────────────────────────────────────────
# (canonical exercise name, muscle_group, measurement_type). distance_time if the
# row has a distance, else time_only fallback handled below.
ACTIVITY = [
    (r"soccer", "Soccer"),
    (r"pickleball", "Pickleball"),
    (r"volleyball", "Volleyball"),
    (r"badminton", "Badminton"),
    (r"boulder|climb", "Bouldering"),
    (r"\byoga\b|pilates|solidcore", "Yoga"),
    (r"dance", "Dance"),
    (r"soulcycle|cyclebar|spin", "Spin Class"),
    (r"kayak", "Kayaking"),
    (r"xc ski|ski", "Skiing"),
    (r"rollerblad", "Rollerblading"),
    (r"e-bike|ebike|bike|cycl|bik", "Cycling"),
    (r"stair", "Stairmaster"),
    (r"elliptical|eliptical", "Elliptical"),
    (r"\bpt\b|physical therap", "Physical Therapy"),
    (r"\brow", "Rowing"),
    (r"barry|bootcamp|orangetheory|f45|arena|ripped|circuit|class", "Fitness Class"),
    (r"hik", "Hiking"),
    (r"walk|snow", "Walking"),
    (r"run|jog|strid", "Running"),
]
# measurement type for activities that are distance-capable
DIST_ACT = {"Running", "Hiking", "Cycling", "Rollerblading", "Walking", "Rowing"}
ACT_GROUP = {  # muscle group for new activity exercises
    "Soccer": "cardio", "Pickleball": "cardio", "Volleyball": "cardio",
    "Badminton": "cardio", "Bouldering": "full", "Yoga": "full", "Dance": "cardio",
    "Spin Class": "cardio", "Kayaking": "full", "Skiing": "cardio",
    "Fitness Class": "full", "Walking": "cardio", "Elliptical": "cardio",
    "Physical Therapy": "full",
}

def activity_for(desc):
    d = desc.strip().lower()
    for pat, name in ACTIVITY:
        if re.search(pat, d):
            return name
    return None

# ── Build ────────────────────────────────────────────────────────────────────
def build():
    rows = list(csv.DictReader(open(CSV)))
    # Determine year for the year-less first row from the next dated row.
    next_year = None
    for r in rows[1:]:
        m = re.search(r"/(\d{4})$", r["Date"])
        if m: next_year = int(m[1]); break

    exercises = {}  # name -> (group, mtype)
    def reg(name, group, mtype):
        exercises.setdefault(name, (group, mtype))

    workouts = []
    unparsed_gym_lines = []
    for r in rows:
        date = parse_date(r["Date"], next_year)
        typ = r["Type"].strip()
        desc = r["Description"].strip()
        mins = r["Time (Minutes)"].strip()
        dist = r["Distance (Miles)"].strip()
        elev = r["Elevation Gain (ft)"].strip()
        # Compose notes from the log's side columns.
        note_bits = []
        if r["Notes"].strip(): note_bits.append(r["Notes"].strip())
        if r["Shoes"].strip() and r["Shoes"].strip() != "--": note_bits.append(f"Shoes: {r['Shoes'].strip()}")
        if r["Knee Pain (0-10)"].strip(): note_bits.append(f"Knee pain: {r['Knee Pain (0-10)'].strip()}/10")
        if r["Energy Levels (0-10)"].strip(): note_bits.append(f"Energy: {r['Energy Levels (0-10)'].strip()}/10")
        if r.get("Listened to","" ).strip(): note_bits.append(f"Listened to: {r['Listened to'].strip()}")
        notes = " · ".join(note_bits) or None

        instances = []
        if typ == "Gym":
            pos = 0
            leftovers = []  # unparsed lines, appended to notes so nothing is lost
            for ln in desc.split("\n"):
                for sub in split_line(ln):
                    parsed = parse_line(sub)
                    if parsed:
                        name, mtype, sets = parsed
                        reg(name, META[name][0], mtype)
                        instances.append({"exercise": name, "sets": sets, "position": pos})
                        pos += 1
                    elif sub.strip() and not sub.strip().endswith(":"):
                        unparsed_gym_lines.append(sub.strip())
                        leftovers.append(sub.strip())
            if leftovers:
                extra = "Also (unstructured): " + "; ".join(leftovers)
                notes = f"{notes} · {extra}" if notes else extra
            # If nothing parsed (pure studio class), keep whole desc as a Fitness Class instance.
            if not instances:
                reg("Fitness Class", "full", "time_only")
                secs = int(round((num(mins) or 0)*60))
                instances.append({"exercise": "Fitness Class",
                                   "sets": [{"duration_s": secs}] if secs else [{"duration_s": 0}],
                                   "position": 0})
            wtype = "Gym"
            title = None
        else:
            # Cardio / sport / other → one instance.
            act = activity_for(desc) or (typ if typ in ("Running","Hiking","Biking") else "Other")
            if act == "Biking": act = "Cycling"
            if act == "Other": act = "Workout"  # generic fallback
            is_dist = bool(dist) and act in DIST_ACT
            mtype = "distance_time" if is_dist else "time_only"
            group = ACT_GROUP.get(act, "cardio")
            reg(act, group, mtype)
            s = {}
            if num(mins) is not None: s["duration_s"] = int(round(num(mins)*60))
            if is_dist and num(dist) is not None: s["distance_m"] = round(num(dist)*M_PER_MILE, 2)
            if is_dist and num(elev) is not None: s["elevation_gain_m"] = round(num(elev)*M_PER_FOOT, 2)
            instances.append({"exercise": act, "sets": [s], "position": 0})
            wtype = act
            title = desc if len(desc) <= 60 else desc[:57]+"…"

        workouts.append({
            "date": date.isoformat(), "workout_type": wtype, "title": title,
            "notes": notes, "instances": instances,
        })
    return exercises, workouts, unparsed_gym_lines

def sqls(s):
    """SQL string literal (single-quote escaped), or NULL."""
    if s is None:
        return "null"
    return "'" + str(s).replace("'", "''") + "'"

def emit_sql(exercises, workouts, user_id):
    """Emit an idempotent SQL batch. Exercises are per-user customs (owner_id =
    the user) created only if a same-named exercise isn't already visible to
    them; workouts + instances insert with a run tag so a re-run can be undone."""
    out = []
    out.append("begin;")
    out.append(f"-- Import from data/connor_log.csv for user {user_id}")
    uid = f"{sqls(user_id)}::uuid"

    # 1. Ensure each exercise exists (global seed OR this user's custom). Insert a
    #    per-user custom only when no visible exercise of that name exists yet.
    for name in sorted(exercises):
        group, mtype = exercises[name]
        out.append(
            f"insert into public.exercises (owner_id, name, muscle_group, measurement_type) "
            f"select {uid}, {sqls(name)}, {sqls(group)}, {sqls(mtype)}::public.measurement_type "
            f"where not exists (select 1 from public.exercises e where e.name = {sqls(name)} "
            f"and (e.owner_id is null or e.owner_id = {uid}));"
        )

    # 2. Insert workouts + their instances. Tag each workout via extra->import so
    #    the whole batch is reversible.
    for w in workouts:
        performed = f"{w['date']}T12:00:00Z"  # local-noon convention, TZ-safe
        out.append(
            f"with w as (insert into public.workouts "
            f"(user_id, title, workout_type, notes, performed_at, extra) values "
            f"({uid}, {sqls(w['title'])}, {sqls(w['workout_type'])}, {sqls(w['notes'])}, "
            f"{sqls(performed)}::timestamptz, '{{\"import\":\"connor_log\"}}'::jsonb) returning id)"
        )
        # Each instance resolves its exercise_id from the visible catalog.
        inst_selects = []
        for i in w["instances"]:
            sets_json = json.dumps(i["sets"]).replace("'", "''")
            inst_selects.append(
                f"select w.id, (select e.id from public.exercises e where e.name = {sqls(i['exercise'])} "
                f"and (e.owner_id is null or e.owner_id = {uid}) order by e.owner_id nulls last limit 1), "
                f"{uid}, {i['position']}, '{sets_json}'::jsonb from w"
            )
        out[-1] += (
            "\ninsert into public.exercise_instances (workout_id, exercise_id, user_id, position, sets)\n"
            + "\nunion all\n".join(inst_selects) + ";"
        )
    out.append("commit;")
    return "\n".join(out)

if __name__ == "__main__":
    exercises, workouts, unparsed = build()
    if "--emit-sql" in sys.argv:
        uid = sys.argv[sys.argv.index("--emit-sql") + 1]
        print(emit_sql(exercises, workouts, uid))
        sys.exit(0)
    if "--dry-run" in sys.argv:
        total_inst = sum(len(w["instances"]) for w in workouts)
        total_sets = sum(len(i["sets"]) for w in workouts for i in w["instances"])
        print(f"workouts: {len(workouts)}")
        print(f"instances: {total_inst}")
        print(f"expanded sets: {total_sets}")
        print(f"NEW/used exercises ({len(exercises)}):")
        for n in sorted(exercises): print(f"   {exercises[n][1]:14} {exercises[n][0]:9} {n}")
        print(f"\nUNPARSED gym lines ({len(unparsed)}):")
        for l in unparsed[:60]: print("   ·", l[:90])
        json.dump({"exercises": exercises, "workouts": workouts},
                  open("/tmp/import_preview.json","w"), indent=1)
        print("\npreview JSON → /tmp/import_preview.json")
